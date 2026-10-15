"use client";

import { useEffect, useRef, useState } from "react";
import {
  addDays,
  addMinutes,
  format,
  isSameDay,
  isToday,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { Course } from "@/types/calendar";
import { courseTone } from "@/types/calendar";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_ROW_PX,
  WEEK_OPTS,
  eventsOnDay,
  formatEventTime,
  gridPlacement,
  layoutDayColumn,
  type ScheduledEvent,
} from "@/lib/calendar/event-utils";
import { NewEventForm } from "./NewEventForm";

interface Props {
  anchor: Date;
  events: ScheduledEvent[];
  courseById: Map<string, Course>;
  onSelect: (id: string) => void;
  /** A new event, from a click or a drag across empty time. */
  onCreate: (title: string, start: Date, end: Date) => void;
  /** An event dragged to another time or day, or resized by its bottom edge. */
  onMove: (id: string, start: Date, end: Date) => void;
}

const GRID_COLUMNS = "72px repeat(7, minmax(140px, 1fr))";
/** The shortest an event draws, so a 15-minute one still shows its time and title. */
const MIN_EVENT_PX = 22;
/** Times snap to quarter hours, as in Apple Calendar. */
const SNAP = 15;
const DAY_MINUTES = 24 * 60;
/** How far the pointer goes before a press on an event becomes a drag rather than a click. */
const DRAG_THRESHOLD_PX = 4;
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
);

/** Your own events and subtasks move. Canvas due dates and timetabled classes stay where they are. */
const movable = (ev: ScheduledEvent) => ev.type === "task";

/** What a press on the grid is doing, in minutes after the day column's midnight. */
type Drag =
  | { kind: "create"; day: number; from: number; to: number }
  | { kind: "move"; id: string; day: number; start: number; length: number; grab: number; x: number; y: number; moved: boolean }
  | { kind: "resize"; id: string; day: number; start: number; end: number };

/** A new event waiting for its name. */
interface Draft {
  day: number;
  start: number;
  end: number;
}

const formatHourLabel = (hour: number) => {
  const normalized = hour % 12 || 12;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${normalized}${suffix}`;
};

const isWeekend = (day: Date) => day.getDay() === 0 || day.getDay() === 6;
const minutesOf = (date: Date) => date.getHours() * 60 + date.getMinutes();
const toPx = (minutes: number) => ((minutes - DAY_START_HOUR * 60) / 60) * HOUR_ROW_PX;
const clamp = (value: number, low: number, high: number) => Math.min(high, Math.max(low, value));

export function WeekView({ anchor, events, courseById, onSelect, onCreate, onMove }: Props) {
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);
  const columns = useRef<(HTMLDivElement | null)[]>([]);
  const [drag, setDrag] = useState<Drag | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  // A drag ends with the pointer still on the event, and the browser then sends it a click.
  const suppressClick = useRef(false);

  const update = (next: Drag | null) => {
    dragRef.current = next;
    setDrag(next);
  };
  const at = (day: number, minutes: number) => addMinutes(startOfDay(days[day]), minutes);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, 8 * HOUR_ROW_PX - 12);
    }
  }, [anchor]);

  // The minute under the pointer in a day column, snapped to a quarter hour.
  const minuteAt = (day: number, clientY: number, snap: "floor" | "round") => {
    const rect = columns.current[day]?.getBoundingClientRect();
    if (!rect) return 0;
    const raw = DAY_START_HOUR * 60 + ((clientY - rect.top) / HOUR_ROW_PX) * 60;
    return clamp(Math[snap](raw / SNAP) * SNAP, 0, DAY_MINUTES);
  };

  // The day column under the pointer, or the nearest one.
  const dayAt = (clientX: number) => {
    let nearest = 0;
    columns.current.forEach((column, i) => {
      const rect = column?.getBoundingClientRect();
      if (rect && clientX >= rect.left) nearest = i;
    });
    return nearest;
  };

  // While a press is on, follow the pointer anywhere on the page.
  useEffect(() => {
    if (!drag) return;
    const follow = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (d.kind === "create") {
        update({ ...d, to: minuteAt(d.day, e.clientY, "round") });
      } else if (d.kind === "resize") {
        update({ ...d, end: clamp(minuteAt(d.day, e.clientY, "round"), d.start + SNAP, DAY_MINUTES) });
      } else {
        const moved = d.moved || Math.hypot(e.clientX - d.x, e.clientY - d.y) > DRAG_THRESHOLD_PX;
        if (!moved) return;
        const day = dayAt(e.clientX);
        const start = clamp(minuteAt(day, e.clientY, "round") - d.grab, 0, DAY_MINUTES - d.length);
        update({ ...d, moved, day, start: Math.round(start / SNAP) * SNAP });
      }
    };
    const end = () => {
      const d = dragRef.current;
      update(null);
      if (!d) return;
      if (d.kind === "create") {
        const from = Math.min(d.from, d.to);
        const to = Math.max(d.from, d.to);
        // A click is an hour-long event; a drag is the time dragged across.
        setDraft({ day: d.day, start: from, end: to - from >= SNAP ? to : Math.min(from + 60, DAY_MINUTES) });
      } else if (d.kind === "resize") {
        suppressClick.current = true;
        onMove(d.id, at(d.day, d.start), at(d.day, d.end));
      } else if (d.moved) {
        suppressClick.current = true;
        onMove(d.id, at(d.day, d.start), at(d.day, d.start + d.length));
      }
    };
    const cancel = () => update(null);
    const escape = (e: KeyboardEvent) => e.key === "Escape" && cancel();
    window.addEventListener("pointermove", follow);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("pointermove", follow);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", escape);
    };
    // Bound once per press: everything it reads is in dragRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drag !== null]);

  const booked = events.filter((ev) => ev.type !== "assessment");
  // The event being dragged is drawn where it would land, so the other events make room for it.
  const shown = booked.map((ev) => {
    if (!drag || drag.kind === "create" || drag.id !== ev.id) return ev;
    if (drag.kind === "move" && !drag.moved) return ev;
    const end = drag.kind === "move" ? drag.start + drag.length : drag.end;
    return { ...ev, start: at(drag.day, drag.start).toISOString(), end: at(drag.day, end).toISOString() };
  });
  // The time being picked for a new event: the drag in progress, or the one waiting for a name.
  const picking =
    drag?.kind === "create"
      ? { day: drag.day, start: Math.min(drag.from, drag.to), end: Math.max(Math.max(drag.from, drag.to), Math.min(drag.from, drag.to) + SNAP) }
      : draft;

  const dueByDay = (day: Date) =>
    events.filter(
      (ev) =>
        ev.type === "assessment" &&
        ev.dueDate &&
        isSameDay(new Date(ev.dueDate), day),
    );
  const hasAllDayEvents = days.some((day) => dueByDay(day).length > 0);

  return (
    <div ref={scrollRef} className="cb-scroll min-h-0 flex-1 overflow-x-auto overflow-y-auto">
      <div className={`min-w-[980px] ${drag ? "select-none" : ""}`}>
        <div className="sticky top-0 z-20 bg-background">
          <div
            className="grid border-b border-border bg-background"
            style={{ gridTemplateColumns: GRID_COLUMNS }}
          >
            <div className="bg-surface-muted/40" />
            {days.map((day) => (
              <div
                key={day.toISOString()}
                className={`flex min-w-0 flex-col items-center border-l border-border px-2 py-1 text-center ${
                  isWeekend(day) ? "bg-surface-muted/30" : "bg-background"
                } ${isToday(day) ? "bg-primary-light/10" : ""}`}
              >
                <div className="text-sm font-medium text-text-muted">{format(day, "EEE")}</div>
                <div className={`mt-1 text-sm ${isToday(day) ? "font-semibold text-primary" : "text-text"}`}>
                  {format(day, "d")}
                </div>
              </div>
            ))}
          </div>

          {hasAllDayEvents && (
            <div
              className="grid border-b border-border bg-background"
              style={{ gridTemplateColumns: GRID_COLUMNS }}
            >
              <div className="flex items-center justify-end bg-surface-muted/40 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-text-light">
                All day
              </div>
              {days.map((day) => {
                const allDay = dueByDay(day);
                const visible = allDay.slice(0, 3);
                const overflow = allDay.length - visible.length;
                return (
                  <div
                    key={`${day.toISOString()}-allday`}
                    className={`flex min-h-[58px] min-w-0 flex-col gap-1 border-l border-border px-2 py-1 ${
                      isWeekend(day) ? "bg-surface-muted/30" : "bg-background"
                    } ${isToday(day) ? "bg-primary-light/10" : ""}`}
                  >
                    {visible.map((ev) => {
                      const tone = courseTone(courseById.get(ev.courseId ?? "")?.color);
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onSelect(ev.id)}
                          className="flex w-full items-center gap-2 overflow-hidden rounded-md px-2 py-1 text-left text-sm transition-colors hover:brightness-[0.98]"
                          style={{ background: tone.bg, color: tone.fg }}
                          title={ev.title}
                        >
                          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: tone.solid }} />
                          <span className="truncate font-medium">{ev.title}</span>
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <button onClick={() => onSelect(allDay[0]?.id ?? "")} className="text-left text-sm text-text-muted" type="button">
                        +{overflow} more
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="grid" style={{ gridTemplateColumns: GRID_COLUMNS, borderTop: "1px solid var(--color-border)", position: "relative", zIndex: 0 }}>
          <div className="flex flex-col bg-surface-muted/40">
            {HOURS.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_ROW_PX }}
                className="flex items-start justify-end pr-3 pt-1.5 text-[11px] font-medium text-text-muted"
              >
                <span className="leading-none">{h === 0 ? "12am" : formatHourLabel(h)}</span>
              </div>
            ))}
          </div>

          {days.map((day, di) => {
            const laid = layoutDayColumn(eventsOnDay(shown, day));
            return (
              <div
                key={day.toISOString()}
                ref={(el) => {
                  columns.current[di] = el;
                }}
                onPointerDown={(e) => {
                  // While a new event is being named, a click elsewhere just closes the box.
                  if (e.button !== 0 || draft) return;
                  const minute = minuteAt(di, e.clientY, "floor");
                  update({ kind: "create", day: di, from: minute, to: minute });
                }}
                className={`relative min-w-0 border-l border-border transition-colors ${
                  isWeekend(day) ? "bg-surface-muted/30" : "bg-background"
                } ${isToday(day) ? "bg-primary-light/10" : ""}`}
                style={{ height: HOURS.length * HOUR_ROW_PX }}
              >
                {HOURS.map((h) => (
                  <div
                    key={h}
                    style={{ height: HOUR_ROW_PX }}
                    className="border-b border-border"
                  />
                ))}

                {isToday(day) && <NowLine />}

                {laid.map(({ event, lane, lanes }) => {
                  const { top, height } = gridPlacement(event, day);
                  const tone = courseTone(courseById.get(event.courseId ?? "")?.color);
                  const widthPct = 100 / lanes;
                  // A 1px inset each side keeps back-to-back events apart, and a floor keeps a 15-minute one readable.
                  const drawn = Math.max(height - 2, MIN_EVENT_PX);
                  const compact = drawn < 44;
                  const canMove = movable(event);
                  const dragging = drag !== null && drag.kind !== "create" && drag.id === event.id;
                  const start = minutesOf(new Date(event.start));
                  const length = Math.max(SNAP, Math.round((+new Date(event.end) - +new Date(event.start)) / 60_000));
                  return (
                    <button
                      key={event.id}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        suppressClick.current = false;
                        if (!canMove || e.button !== 0) return;
                        update({
                          kind: "move",
                          id: event.id,
                          day: di,
                          start,
                          length,
                          grab: minuteAt(di, e.clientY, "round") - start,
                          x: e.clientX,
                          y: e.clientY,
                          moved: false,
                        });
                      }}
                      onClick={() => {
                        if (suppressClick.current) {
                          suppressClick.current = false;
                          return;
                        }
                        onSelect(event.id);
                      }}
                      title={`${event.title} · ${formatEventTime(event)}${canMove ? " · drag to move" : ""}`}
                      style={{
                        top: top + 1,
                        height: drawn,
                        left: `calc(${lane * widthPct}% + ${lane === 0 ? 4 : 2}px)`,
                        width: `calc(${widthPct}% - ${lane === 0 ? 6 : 4}px)`,
                        background: tone.bg,
                        borderColor: tone.border,
                        borderLeft: `3px solid ${tone.solid}`,
                        color: tone.fg,
                        opacity: event.status === "done" ? 0.6 : 1,
                        touchAction: canMove ? "none" : undefined,
                      }}
                      className={`absolute overflow-hidden rounded-md border text-left transition-shadow ${
                        dragging ? "z-20 shadow-lg ring-2 ring-primary/40" : "shadow-sm hover:z-10 hover:shadow-md"
                      } ${canMove ? (dragging ? "cursor-grabbing" : "cursor-grab") : ""} ${
                        compact ? "flex items-center gap-1.5 px-1.5 text-xs leading-tight" : "px-2 py-1 text-sm"
                      } ${event.status === "done" ? "line-through decoration-1" : ""}`}
                    >
                      {compact ? (
                        <>
                          <span className="shrink-0 tabular-nums opacity-75">{format(new Date(event.start), "h:mm")}</span>
                          <span className="truncate font-medium">{event.title}</span>
                        </>
                      ) : (
                        <>
                          <div className="truncate font-medium">{event.title}</div>
                          <div className="truncate text-xs opacity-75">{formatEventTime(event)}</div>
                          {event.location && <div className="truncate text-xs opacity-75">{event.location}</div>}
                        </>
                      )}
                      {canMove && (
                        // Drag the bottom edge to change how long it is.
                        <span
                          aria-hidden="true"
                          onPointerDown={(e) => {
                            e.stopPropagation();
                            suppressClick.current = false;
                            if (e.button !== 0) return;
                            update({ kind: "resize", id: event.id, day: di, start, end: start + length });
                          }}
                          className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize"
                        />
                      )}
                    </button>
                  );
                })}

                {picking && picking.day === di && (
                  <div
                    className="pointer-events-none absolute left-1 right-1 z-20 rounded-md border-2 border-primary bg-primary-light/20 px-1.5 py-0.5 text-xs font-medium text-primary"
                    style={{
                      top: toPx(picking.start) + 1,
                      height: Math.max(toPx(picking.end) - toPx(picking.start) - 2, MIN_EVENT_PX),
                    }}
                  >
                    {format(at(di, picking.start), "h:mm")} – {format(at(di, picking.end), "h:mm a")}
                  </div>
                )}

                {draft && draft.day === di && (
                  <NewEventForm
                    when={`${format(at(di, draft.start), "EEE d MMM, h:mm")} – ${format(at(di, draft.end), "h:mm a")}`}
                    onSave={(title) => {
                      onCreate(title, at(di, draft.start), at(di, draft.end));
                      setDraft(null);
                    }}
                    onCancel={() => setDraft(null)}
                    className={`absolute z-30 ${di >= 5 ? "right-1" : "left-1"}`}
                    style={{ top: toPx(draft.end) + 4 }}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function NowLine() {
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const top = ((minutes - DAY_START_HOUR * 60) / 60) * HOUR_ROW_PX;
  if (top < 0 || top > (DAY_END_HOUR - DAY_START_HOUR + 1) * HOUR_ROW_PX)
    return null;

  const label = format(now, "h:mm a");
  return (
    <div className="time-grid-now-line" style={{ top }} title={label} aria-label={label}>
      <div className="time-grid-now-dot" />
      <div className="time-grid-now-track" />
    </div>
  );
}
