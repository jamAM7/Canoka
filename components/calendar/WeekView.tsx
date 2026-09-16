"use client";

import { useEffect, useRef } from "react";
import {
  addDays,
  format,
  isSameDay,
  isToday,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent, Course } from "@/types/calendar";
import {
  DAY_END_HOUR,
  DAY_START_HOUR,
  HOUR_ROW_PX,
  WEEK_OPTS,
  eventsOnDay,
  formatEventTime,
  gridPlacement,
  layoutDayColumn,
} from "@/lib/calendar/event-utils";
import { courseTone } from "@/lib/calendar/colors";

interface Props {
  anchor: Date;
  events: CalendarEvent[];
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

export function WeekView({ anchor, events, courseById, onSelect }: Props) {
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to ~8am on mount / week change.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, (8 - DAY_START_HOUR) * HOUR_ROW_PX - 12);
    }
  }, [anchor]);

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
      <div className={`sticky top-0 z-20 grid ${COLUMNS} items-start border-b border-border-strong bg-background`}>
        <div />
        {days.map((day) => (
          <div key={day.toISOString()} className="flex min-w-0 flex-col items-center p-2 text-center">
            <div className="text-sm font-medium text-text-muted">{format(day, "EEE")}</div>
            <div className={`text-sm mt-1 ${isToday(day) ? "font-semibold text-primary" : "text-text"}`}>
              {format(day, "d")}
            </div>
            <div className="mt-1 flex flex-col gap-1 w-full">
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
      <div className={`relative grid ${COLUMNS}`}>
        {/* Hour labels */}
        <div className="flex flex-col pr-3 text-right">
          {HOURS.map((h) => (
            <div key={h} style={{ height: HOUR_ROW_PX }} className="text-xs text-text-muted">
              {h === 0 ? "" : format(new Date().setHours(h, 0), "h a").toLowerCase()}
            </div>
          ))}
        </div>

        {/* Day columns */}
        {days.map((day) => {
          const laid = layoutDayColumn(eventsOnDay(events, day));
          return (
            <div
              key={day.toISOString()}
              className="relative min-w-0 border-l border-border-strong last:border-r"
              style={{ height: HOURS.length * HOUR_ROW_PX }}
            >
              {HOURS.map((h) => (
                <div key={h} style={{ height: HOUR_ROW_PX }} className="border-b border-border-strong" />
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
                    }}
                    className={`absolute rounded-md border px-2 py-1 text-sm text-left overflow-hidden ${
                      event.status === "done" ? "opacity-60" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {event.type === "assessment" && <span className="text-xs">◆</span>}
                      <span className="truncate font-medium">{event.title}</span>
                    </div>
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
