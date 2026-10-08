"use client";

import { useEffect, useRef } from "react";
import {
  addDays,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import type { Course } from "@/types/calendar";
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
import { courseTone } from "@/types/calendar";

interface Props {
  anchor: Date;
  events: ScheduledEvent[];
  courseById: Map<string, Course>;
  onSelect: (id: string) => void;
}

// Hour-label gutter plus seven equal days. The header and the time grid share
// this template so every day header sits exactly over its column.
const COLUMNS = "grid-cols-[72px_repeat(7,minmax(0,1fr))]";

const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
);
const ALL_DAY_HEIGHT = 52;

const formatHourLabel = (hour: number) => {
  const normalized = hour % 12 || 12;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${normalized}${suffix}`;
};

export function WeekView({ anchor, events, courseById, onSelect }: Props) {
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to ~8am on mount / week change while still using a 12am->12am grid.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, 8 * HOUR_ROW_PX - 12);
    }
  }, [anchor]);

  // Assessments are deadlines, not blocks of time: they're flagged in the day
  // header, and the time grid holds classes and tasks.
  const booked = events.filter((ev) => ev.type !== "assessment");
  const dueByDay = (day: Date) =>
    events.filter(
      (ev) =>
        ev.type === "assessment" &&
        ev.dueDate &&
        isSameDay(new Date(ev.dueDate), day),
    );

  // The day header sits inside the scroll area and sticks to the top, so it
  // keeps the same width as the day columns when the scrollbar appears.
  return (
    <div ref={scrollRef} className="cb-scroll min-h-0 flex-1 overflow-y-auto">
      {/* Day header */}
      <div className={`sticky top-0 z-20 grid ${COLUMNS} items-start bg-background`}>
        <div />
        {days.map((day) => (
          <div
            key={day.toISOString()}
            className="flex min-w-0 flex-col items-center border-l border-border bg-background px-2 pb-2 pt-2 text-center first:border-l-0"
          >
            <div className="text-sm font-medium text-text-muted">{format(day, "EEE")}</div>
            <div className={`mt-1 text-sm ${isToday(day) ? "font-semibold text-primary" : "text-text"}`}>
              {format(day, "d")}
            </div>
            <div className="mt-3 flex w-full flex-col gap-1 border-t border-border pt-2">
              {dueByDay(day).map((ev) => {
                const tone = courseTone(courseById.get(ev.courseId ?? "")?.color);
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev.id)}
                    className="w-full truncate rounded-md px-2 py-1 text-sm"
                    style={{ background: tone.bg, color: tone.fg }}
                    title={`Due: ${ev.title}`}
                  >
                    ⚑ {ev.title}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Time grid */}
      <div className={`relative grid ${COLUMNS} border-t border-border`}>
        {/* Hour labels */}
        <div className="flex flex-col pr-3 text-right">
          {HOURS.map((h) => (
            <div
              key={h}
              style={{ height: HOUR_ROW_PX }}
              className="relative text-xs text-text-muted leading-none"
            >
              <span className="absolute right-0 top-0">{h === 0 ? "12am" : formatHourLabel(h)}</span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const laid = layoutDayColumn(eventsOnDay(booked, day));
          return (
            <div
              key={day.toISOString()}
              className="relative min-w-0 border-l border-border bg-background first:border-l-0 last:border-r"
              style={{ height: HOURS.length * HOUR_ROW_PX }}
            >
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_ROW_PX }} className="border-b border-border" />
              ))}

              {isToday(day) && <NowLine />}

              {laid.map(({ event, lane, lanes }) => {
                const { top, height } = gridPlacement(event, day);
                const tone = courseTone(courseById.get(event.courseId ?? "")?.color);
                const widthPct = 100 / lanes;
                return (
                  <button
                    key={event.id}
                    onClick={() => onSelect(event.id)}
                    style={{
                      top,
                      height,
                      left: `calc(${lane * widthPct}% + 6px)`,
                      width: `calc(${widthPct}% - 12px)`,
                      background: tone.bg,
                      borderColor: tone.border,
                      color: tone.fg,
                      opacity: event.status === "done" ? 0.7 : 0.82,
                    }}
                    className="absolute rounded-md border px-2 py-1 text-sm text-left overflow-hidden"
                  >
                    <div className="truncate font-medium">{event.title}</div>
                    <div className="text-xs opacity-75 truncate">{formatEventTime(event)}{event.location ? ` · ${event.location}` : ""}</div>
                  </button>
                );
              })}
            </div>
          );
        })}
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
  return (
    <div className="time-grid-now-line" style={{ top }}>
      <div className="time-grid-now-dot" />
      <div className="time-grid-now-track" />
    </div>
  );
}
