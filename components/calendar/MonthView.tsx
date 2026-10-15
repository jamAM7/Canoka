"use client";

import { useState } from "react";
import {
  addMinutes,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { courseTone, type Course } from "@/types/calendar";
import {
  WEEK_OPTS,
  eventsOnDay,
  type ScheduledEvent,
} from "@/lib/calendar/event-utils";
import { NewEventForm } from "./NewEventForm";

interface Props {
  anchor: Date;
  events: ScheduledEvent[];
  courseById: Map<string, Course>;
  onSelect: (id: string) => void;
  onPickDay: (d: Date) => void;
  /** A new event, from double-clicking a day. */
  onCreate: (title: string, start: Date, end: Date) => void;
  /** An event dragged onto another day. */
  onMove: (id: string, start: Date, end: Date) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE = 3;
// Tall enough for the date, MAX_VISIBLE events and "+N more" (min-h-44 = 176px).
// Rows grow to fill tall screens; on shorter ones the month scrolls.
const CELL_MIN_HEIGHT = "min-h-44";
/** A day's new event starts at 9 am and lasts an hour; Week view can move it from there. */
const NEW_EVENT_START_MINUTES = 9 * 60;

/** Your own events and subtasks move. Canvas due dates and timetabled classes stay where they are. */
const movable = (ev: ScheduledEvent) => ev.type === "task";

export function MonthView({
  anchor,
  events,
  courseById,
  onSelect,
  onPickDay,
  onCreate,
  onMove,
}: Props) {
  const gridStart = startOfWeek(startOfMonth(anchor), WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(anchor), WEEK_OPTS);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  const [draftDay, setDraftDay] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropDay, setDropDay] = useState<string | null>(null);

  /** The same time of day, on `day`. */
  const moveTo = (ev: ScheduledEvent, day: Date) => {
    const start = new Date(ev.start);
    const length = +new Date(ev.end) - +start;
    const next = addMinutes(startOfDay(day), start.getHours() * 60 + start.getMinutes());
    onMove(ev.id, next, new Date(+next + length));
  };

  return (
    <div className="cb-scroll flex min-h-0 flex-1 flex-col overflow-y-auto">
      <div className="sticky top-0 z-10 grid grid-cols-7 border-b border-border-strong bg-background text-sm text-text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid flex-1" style={{ gridTemplateRows: `repeat(${weeks.length}, minmax(min-content, 1fr))` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-border-strong">
            {week.map((day, di) => {
              const key = day.toISOString();
              const dayEvents = eventsOnDay(events, day);
              const inMonth = isSameMonth(day, anchor);
              const visible = dayEvents.slice(0, MAX_VISIBLE);
              const overflow = dayEvents.length - visible.length;

              return (
                <div
                  key={key}
                  onDoubleClick={(e) => {
                    // Double-clicking an event opens it; only the day's empty space makes a new one.
                    if ((e.target as HTMLElement).closest("button, form")) return;
                    setDraftDay(key);
                  }}
                  onDragOver={(e) => {
                    if (!draggingId) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = "move";
                    setDropDay(key);
                  }}
                  onDragLeave={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropDay((d) => (d === key ? null : d));
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    const ev = events.find((x) => x.id === e.dataTransfer.getData("text/plain"));
                    if (ev && movable(ev)) moveTo(ev, day);
                    setDraggingId(null);
                    setDropDay(null);
                  }}
                  className={`${CELL_MIN_HEIGHT} relative min-w-0 border-r border-border-strong p-2 transition-colors ${
                    inMonth ? "" : "bg-surface-muted/60"
                  } ${dropDay === key ? "bg-primary-light/15 ring-2 ring-inset ring-primary/40" : ""}`}
                >
                  {/* Dim days outside the month without fading the grid lines. */}
                  <div className={inMonth ? undefined : "opacity-60"}>
                    <button
                      onClick={() => onPickDay(day)}
                      className={`mb-2 text-sm font-semibold ${isToday(day) ? "text-primary" : "text-text"}`}
                      style={{ background: isToday(day) ? undefined : "transparent", border: 0 }}
                    >
                      {format(day, "d")}
                    </button>

                    <div className="flex flex-col gap-2">
                      {visible.map((ev) => {
                        const tone = courseTone(courseById.get(ev.courseId ?? "")?.color);
                        const canMove = movable(ev);
                        return (
                          <button
                            key={ev.id}
                            onClick={() => onSelect(ev.id)}
                            draggable={canMove}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/plain", ev.id);
                              e.dataTransfer.effectAllowed = "move";
                              setDraggingId(ev.id);
                            }}
                            onDragEnd={() => {
                              setDraggingId(null);
                              setDropDay(null);
                            }}
                            title={canMove ? `${ev.title} · drag to another day` : ev.title}
                            className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm text-left truncate ${
                              canMove ? "cursor-grab active:cursor-grabbing" : ""
                            } ${draggingId === ev.id ? "opacity-50" : ""}`}
                            style={{ background: tone.bg, color: tone.fg }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.solid }} />
                            <span className="tabular-nums text-xs opacity-75">
                              {ev.type === "assessment" ? "Due" : format(new Date(ev.start), "h:mm")}
                            </span>
                            <span className="truncate">{ev.title}</span>
                          </button>
                        );
                      })}
                      {overflow > 0 && (
                        <button onClick={() => onPickDay(day)} className="text-sm text-text-muted">
                          +{overflow} more
                        </button>
                      )}
                    </div>
                  </div>

                  {draftDay === key && (
                    <NewEventForm
                      when={`${format(day, "EEE d MMM")}, 9:00 – 10:00 am`}
                      onSave={(title) => {
                        const start = addMinutes(startOfDay(day), NEW_EVENT_START_MINUTES);
                        onCreate(title, start, addMinutes(start, 60));
                        setDraftDay(null);
                      }}
                      onCancel={() => setDraftDay(null)}
                      className={`absolute top-8 z-30 ${di >= 5 ? "right-1" : "left-1"}`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
