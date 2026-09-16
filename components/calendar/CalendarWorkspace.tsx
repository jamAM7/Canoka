"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  KanbanBoard,
  TaskStatus,
} from "@/types/calendar";
import { WEEK_OPTS } from "@/lib/calendar/event-utils";
import {
  DEFAULT_BOARD,
  addColumn,
  createTask,
  isOnlyColumnFor,
  moveCard,
  removeColumn,
  renameColumn,
  resolveBoard,
  setColumnStatus,
} from "@/lib/calendar/kanban";
import { loadCalendar, saveCalendar } from "@/lib/calendar/storage";
import { Sidebar } from "@/components/shell/Sidebar";
import { CalendarToolbar } from "./CalendarToolbar";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";
import { KanbanView, type BoardColumn } from "./KanbanView";
import { KanbanCardModal } from "./KanbanCardModal";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [board, setBoard] = useState<KanbanBoard>(DEFAULT_BOARD);

  // Restore the student's saved calendar after mount (localStorage doesn't
  // exist during server rendering), then save whenever events or the board
  // change. The first save pass is skipped: it would only write back what was
  // just restored, or freeze the mock data before anything was edited.
  const [restored, setRestored] = useState(false);
  const skipNextSave = useRef(true);

  useEffect(() => {
    const saved = loadCalendar();
    if (saved) {
      setEvents(saved.events);
      setBoard(saved.board);
    }
    setRestored(true);
  }, []);

  useEffect(() => {
    if (!restored) return;
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    saveCalendar({ events, board });
  }, [restored, events, board]);

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

  function updateEvent(id: string, patch: Partial<CalendarEvent>) {
    setEvents((cur) =>
      cur.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)),
    );
  }

  function setStatus(id: string, status: TaskStatus) {
    updateEvent(id, { status });
  }

  // ----- Kanban board -----

  const resolvedBoard = useMemo(() => resolveBoard(events, board), [events, board]);

  const boardColumns = useMemo<BoardColumn[]>(() => {
    const visible = new Set(visibleEvents.map((ev) => ev.id));
    return board.columns.map((column) => ({
      column,
      cards: (resolvedBoard.get(column.id) ?? []).filter((ev) => visible.has(ev.id)),
      locked: isOnlyColumnFor(board, column.id),
    }));
  }, [board, resolvedBoard, visibleEvents]);

  function moveToColumn(id: string, columnId: string, beforeId: string | null) {
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) return;
    setBoard(moveCard(events, board, id, columnId, beforeId));
    setStatus(id, column.status);
  }

  function addTask(columnId: string, title: string) {
    const column = board.columns.find((c) => c.id === columnId);
    if (!column) return;
    const task = createTask(title, column.status);
    const next = [...events, task];
    setEvents(next);
    setBoard(moveCard(next, board, task.id, columnId, null));
  }

  function deleteEvent(id: string) {
    setEvents((cur) => cur.filter((ev) => ev.id !== id));
    setEditingId(null);
    setSelectedId(null);
  }

  function changeColumnStatus(columnId: string, status: TaskStatus) {
    if (isOnlyColumnFor(board, columnId)) return;
    const ids = new Set((resolvedBoard.get(columnId) ?? []).map((ev) => ev.id));
    setBoard(setColumnStatus(board, columnId, status));
    setEvents((cur) => cur.map((ev) => (ids.has(ev.id) ? { ...ev, status } : ev)));
  }

  const closeDetail = useCallback(() => setSelectedId(null), []);
  const closeEditor = useCallback(() => setEditingId(null), []);
  const editing = editingId ? events.find((e) => e.id === editingId) ?? null : null;

  // What the card editor needs for an event; shared by the week/month side
  // panel and the board's modal so a card edits the same in both.
  function editorProps(ev: CalendarEvent | null) {
    return {
      courses,
      parent: ev?.parentId ? events.find((e) => e.id === ev.parentId) ?? null : null,
      subtasks: ev ? events.filter((e) => e.parentId === ev.id) : [],
      columns: board.columns,
      columnId: ev
        ? board.columns.find((col) => resolvedBoard.get(col.id)?.some((c) => c.id === ev.id))?.id ?? null
        : null,
      onChange: updateEvent,
      onMove: (id: string, columnId: string) => moveToColumn(id, columnId, null),
      onDelete: deleteEvent,
    };
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

      {/* min-w-0 on Kanban keeps a board wider than the screen scrolling inside
          itself instead of stretching the page past the viewport. */}
      <div className={`flex min-h-0 flex-1 flex-col ${view === "kanban" ? "min-w-0" : ""}`}>
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

        {/* A flex column, so each view can fill the remaining height and scroll inside it. */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
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
              columns={boardColumns}
              courseById={courseById}
              onOpen={setEditingId}
              onMove={moveToColumn}
              onAddTask={addTask}
              onAddColumn={(title, status) => setBoard((b) => addColumn(b, title, status))}
              onRenameColumn={(id, title) => setBoard((b) => renameColumn(b, id, title))}
              onChangeColumnStatus={changeColumnStatus}
              onRemoveColumn={(id) => setBoard((b) => removeColumn(b, id))}
            />
          )}
        </div>
      </div>

      <EventDetail
        event={selected}
        {...editorProps(selected)}
        onClose={closeDetail}
        onSelect={setSelectedId}
      />

      <KanbanCardModal
        event={editing}
        {...editorProps(editing)}
        onClose={closeEditor}
        onSelect={setEditingId}
      />
    </div>
  );
}
