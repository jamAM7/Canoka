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

  return (
    <div className="calendar" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, borderRadius: 0, border: 0 }}>
      {/* Day header */}
      <div className="time-grid-header">
        <div />
        {days.map((day) => (
          <div key={day.toISOString()} className="time-grid-header-cell">
            <div className="time-grid-header-day">{format(day, "EEE")}</div>
            <div className={`calendar-date ${isToday(day) ? "today" : ""}`} style={{ margin: "2px auto 0" }}>
              {format(day, "d")}
            </div>
            <div className="calendar-day-body" style={{ marginTop: 4 }}>
              {dueByDay(day).map((ev) => {
                const tone = courseTone(courseById.get(ev.courseId ?? "")?.color);
                return (
                  <button
                    key={ev.id}
                    onClick={() => onSelect(ev.id)}
                    className="due-flag"
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
      <div ref={scrollRef} className="cb-scroll time-grid-scroll">
        <div className="time-grid-body">
          {/* Hour labels */}
          <div className="time-grid-hours">
            {HOURS.map((h) => (
              <div key={h} style={{ height: HOUR_ROW_PX }} className="time-grid-hour-label">
                {h === 0
                  ? ""
                  : format(new Date().setHours(h, 0), "h a").toLowerCase()}
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((day) => {
            const laid = layoutDayColumn(eventsOnDay(events, day));
            return (
              <div
                key={day.toISOString()}
                className="time-grid-day"
                style={{ height: HOURS.length * HOUR_ROW_PX }}
              >
                {HOURS.map((h) => (
                  <div key={h} style={{ height: HOUR_ROW_PX }} className="time-grid-hour-row" />
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
                        left: `calc(${lane * widthPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                        background: tone.bg,
                        borderColor: tone.border,
                        color: tone.fg,
                      }}
                      className={`time-grid-event ${event.type === "task" ? "is-task" : ""} ${
                        event.status === "done" ? "is-done" : ""
                      }`}
                    >
                      <div className={`time-grid-event-title ${event.status === "done" ? "is-done" : ""}`}>
                        {event.type === "assessment" && <span>◆</span>}
                        <span className="truncate">{event.title}</span>
                      </div>
                      <div className="time-grid-event-meta truncate">
                        {formatEventTime(event)}
                        {event.location ? ` · ${event.location}` : ""}
                      </div>
                    </button>
                  );
                })}
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
  return (
    <div className="time-grid-now-line" style={{ top }}>
      <div className="time-grid-now-dot" />
      <div className="time-grid-now-track" />
    </div>
  );
}
