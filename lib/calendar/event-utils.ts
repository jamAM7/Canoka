import {
  addMinutes,
  differenceInMinutes,
  endOfWeek,
  format,
  isSameDay,
  isWithinInterval,
  parse as parseDate,
  set,
  startOfDay,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent, TaskStatus } from "@/types/calendar";

export const WEEK_OPTS = { weekStartsOn: 1 as const };

/** Hours shown in the week/day time grid. */
export const DAY_START_HOUR = 7;
export const DAY_END_HOUR = 22;
export const HOUR_ROW_PX = 56;

export function parse(ev: CalendarEvent): { start: Date; end: Date } {
  return { start: new Date(ev.start), end: new Date(ev.end) };
}

export function eventsOnDay(events: CalendarEvent[], day: Date): CalendarEvent[] {
  return events
    .filter((ev) => isSameDay(new Date(ev.start), day))
    .sort((a, b) => +new Date(a.start) - +new Date(b.start));
}

export function eventsInWeek(events: CalendarEvent[], anchor: Date): CalendarEvent[] {
  const start = startOfWeek(anchor, WEEK_OPTS);
  const end = endOfWeek(anchor, WEEK_OPTS);
  return events.filter((ev) =>
    isWithinInterval(new Date(ev.start), { start, end }),
  );
}

/** Vertical placement of an event within the day grid, in pixels. */
export function gridPlacement(ev: CalendarEvent, day: Date) {
  const { start, end } = parse(ev);
  const dayStart = startOfDay(day);
  const minutesFromMidnight = differenceInMinutes(start, dayStart);
  const durationMin = Math.max(differenceInMinutes(end, start), 30);

  const top =
    ((minutesFromMidnight - DAY_START_HOUR * 60) / 60) * HOUR_ROW_PX;
  const height = (durationMin / 60) * HOUR_ROW_PX;
  return { top, height };
}

/**
 * Lane assignment so overlapping events in a day sit side by side instead of
 * stacking on top of each other.
 */
export function layoutDayColumn(events: CalendarEvent[]): Array<{
  event: CalendarEvent;
  lane: number;
  lanes: number;
}> {
  const sorted = [...events].sort(
    (a, b) => +new Date(a.start) - +new Date(b.start),
  );
  const result: Array<{ event: CalendarEvent; lane: number; lanes: number }> = [];
  let cluster: typeof result = [];
  let clusterEnd = 0;

  const flush = () => {
    const lanes = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 1);
    cluster.forEach((c) => (c.lanes = lanes));
    result.push(...cluster);
    cluster = [];
  };

  for (const event of sorted) {
    const start = +new Date(event.start);
    const end = +new Date(event.end);
    if (cluster.length && start >= clusterEnd) flush();

    const taken = new Set(
      cluster
        .filter((c) => +new Date(c.event.end) > start)
        .map((c) => c.lane),
    );
    let lane = 0;
    while (taken.has(lane)) lane += 1;

    cluster.push({ event, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, end);
  }
  if (cluster.length) flush();
  return result;
}

export const STATUS_META: Record<TaskStatus, { label: string }> = {
  coming_up: { label: "Coming Up" },
  todo: { label: "Not Started" },
  in_progress: { label: "In Progress" },
  done: { label: "Completed" },
};

export const STATUS_ORDER: TaskStatus[] = [
  "coming_up",
  "todo",
  "in_progress",
  "done",
];

/**
 * Recompute an event's `start`/`end` from user-edited fields, so a student can
 * drag an AI-generated subtask onto a slot that actually fits their week.
 *
 * - `date` is `yyyy-MM-dd`, `startTime` / `endTime` are `HH:mm` (from native
 *   <input type="date|time">). Any field left undefined keeps its current value.
 * - If the resulting end is not after the start, the original duration is kept
 *   (so editing only the start time shifts the block instead of collapsing it).
 */
export function rescheduleEvent(
  ev: CalendarEvent,
  fields: { date?: string; startTime?: string; endTime?: string },
): { start: string; end: string } {
  const { start, end } = parse(ev);
  const durationMin = Math.max(differenceInMinutes(end, start), 30);

  const day = fields.date
    ? parseDate(fields.date, "yyyy-MM-dd", new Date())
    : start;

  const applyTime = (base: Date, time: string | undefined, fallback: Date) => {
    const [h, m] = time
      ? time.split(":").map(Number)
      : [fallback.getHours(), fallback.getMinutes()];
    return set(base, { year: day.getFullYear(), month: day.getMonth(), date: day.getDate(), hours: h, minutes: m, seconds: 0, milliseconds: 0 });
  };

  const nextStart = applyTime(start, fields.startTime, start);
  let nextEnd = applyTime(end, fields.endTime, end);
  if (nextEnd <= nextStart) nextEnd = addMinutes(nextStart, durationMin);

  return { start: nextStart.toISOString(), end: nextEnd.toISOString() };
}

export function formatEventTime(ev: CalendarEvent): string {
  const { start, end } = parse(ev);
  return `${format(start, "h:mm")}–${format(end, "h:mm a")}`;
}

/** Short relative label for a due date, e.g. "Overdue", "Due today", "in 3 days". */
export function relativeDueLabel(due: Date, now: Date = new Date()): string {
  const dueDay = startOfDay(due);
  const today = startOfDay(now);
  const days = Math.round((+dueDay - +today) / 86_400_000);

  if (due < now) return "Overdue";
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `in ${days} days`;
}

export function typeLabel(ev: CalendarEvent): string {
  if (ev.type === "class") return "Class";
  if (ev.type === "assessment") return "Assessment";
  return ev.parentId ? "Subtask" : "Task";
}
