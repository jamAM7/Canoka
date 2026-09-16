"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  addWeeks,
  endOfWeek,
  format,
  getWeek,
  startOfWeek,
} from "date-fns";
import type {
  CalendarEvent,
  CalendarEventType,
  CalendarViewMode,
  Course,
  TaskStatus,
} from "@/types/calendar";
import { WEEK_OPTS } from "@/lib/calendar/event-utils";
import { Sidebar } from "@/components/shell/Sidebar";
import { CalendarToolbar } from "./CalendarToolbar";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { KanbanView } from "./KanbanView";
import { EventDetail } from "./EventDetail";

interface Props {
  events: CalendarEvent[];
  courses: Course[];
}

const ALL_TYPES: CalendarEventType[] = ["class", "assessment", "task"];

export function CalendarWorkspace({ events: initialEvents, courses }: Props) {
  const [events, setEvents] = useState(initialEvents);
  const [view, setView] = useState<CalendarViewMode>("week");
  const [anchor, setAnchor] = useState<Date>(new Date());
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [hiddenCourses, setHiddenCourses] = useState<Set<string>>(new Set());
  const [hiddenTypes, setHiddenTypes] = useState<Set<CalendarEventType>>(
    new Set(),
  );

  const courseById = useMemo(
    () => new Map(courses.map((c) => [c.id, c])),
    [courses],
  );

  const visibleEvents = useMemo(
    () =>
      events.filter(
        (ev) =>
          !hiddenTypes.has(ev.type) &&
          !(ev.courseId && hiddenCourses.has(ev.courseId)),
      ),
    [events, hiddenCourses, hiddenTypes],
  );

  const selected = selectedId
    ? events.find((e) => e.id === selectedId) ?? null
    : null;

  function shift(dir: 1 | -1) {
    setAnchor((cur) =>
      view === "month" ? addMonths(cur, dir) : addWeeks(cur, dir),
    );
  }

  function setStatus(id: string, status: TaskStatus) {
    setEvents((cur) =>
      cur.map((ev) => (ev.id === id ? { ...ev, status } : ev)),
    );
  }

  function reschedule(id: string, start: string, end: string) {
    setEvents((cur) =>
      cur.map((ev) => (ev.id === id ? { ...ev, start, end } : ev)),
    );
  }

  function toggle<T>(set: Set<T>, value: T): Set<T> {
    const next = new Set(set);
    next.has(value) ? next.delete(value) : next.add(value);
    return next;
  }

  const period = useMemo(() => {
    if (view === "month") {
      return { title: format(anchor, "MMMM"), subtitle: format(anchor, "yyyy") };
    }
    if (view === "kanban") {
      return { title: "Kanban Board" };
    }
    const s = startOfWeek(anchor, WEEK_OPTS);
    const e = endOfWeek(anchor, WEEK_OPTS);
    const sameMonth = s.getMonth() === e.getMonth();
    const range = sameMonth
      ? `${format(s, "MMM d")} – ${format(e, "d, yyyy")}`
      : `${format(s, "MMM d")} – ${format(e, "MMM d, yyyy")}`;
    return { title: `Week ${getWeek(anchor, WEEK_OPTS)}`, subtitle: range };
  }, [view, anchor]);

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar active="calendar" calendarView={view} onCalendarViewChange={setView} />

      <div className="flex min-h-0 flex-1 flex-col">
        <CalendarToolbar
          period={period}
          onPrev={() => shift(-1)}
          onNext={() => shift(1)}
          onToday={() => setAnchor(new Date())}
          showNav={view !== "kanban"}
          courses={courses}
          hiddenCourses={hiddenCourses}
          onToggleCourse={(id) =>
            setHiddenCourses((s) => toggle(s, id))
          }
          types={ALL_TYPES}
          hiddenTypes={hiddenTypes}
          onToggleType={(t) => setHiddenTypes((s) => toggle(s, t))}
        />

        <div className="min-h-0 flex-1 overflow-hidden">
          {view === "week" && (
            <WeekView
              anchor={anchor}
              events={visibleEvents}
              courseById={courseById}
              onSelect={setSelectedId}
            />
          )}
          {view === "month" && (
            <MonthView
              anchor={anchor}
              events={visibleEvents}
              courseById={courseById}
              onSelect={setSelectedId}
              onPickDay={(d) => {
                setAnchor(d);
                setView("week");
              }}
            />
          )}
          {view === "kanban" && (
            <KanbanView
              events={visibleEvents}
              courseById={courseById}
              onSelect={setSelectedId}
              onStatusChange={setStatus}
            />
          )}
        </div>
      </div>

      <EventDetail
        event={selected}
        course={selected?.courseId ? courseById.get(selected.courseId) : undefined}
        parent={
          selected?.parentId
            ? events.find((e) => e.id === selected.parentId) ?? null
            : null
        }
        subtasks={
          selected
            ? events.filter((e) => e.parentId === selected.id)
            : []
        }
        onClose={() => setSelectedId(null)}
        onStatusChange={setStatus}
        onReschedule={reschedule}
        onSelect={setSelectedId}
      />
    </div>
  );
}
