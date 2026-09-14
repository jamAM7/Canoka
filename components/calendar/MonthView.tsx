"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent, Course } from "@/types/calendar";
import { WEEK_OPTS, eventsOnDay } from "@/lib/calendar/event-utils";
import { courseTone } from "@/lib/calendar/colors";

interface Props {
  anchor: Date;
  events: CalendarEvent[];
  courseById: Map<string, Course>;
  onSelect: (id: string) => void;
  onPickDay: (d: Date) => void;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_VISIBLE = 3;

export function MonthView({
  anchor,
  events,
  courseById,
  onSelect,
  onPickDay,
}: Props) {
  const gridStart = startOfWeek(startOfMonth(anchor), WEEK_OPTS);
  const gridEnd = endOfWeek(endOfMonth(anchor), WEEK_OPTS);
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });
  const weeks: Date[][] = [];
  for (let i = 0; i < days.length; i += 7) weeks.push(days.slice(i, i + 7));

  return (
    <div className="calendar" style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, borderRadius: 0, border: 0 }}>
      <div className="calendar-weekdays">
        {WEEKDAYS.map((d) => (
          <div key={d} className="calendar-weekday">
            {d}
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateRows: `repeat(${weeks.length}, 1fr)`, flex: 1, minHeight: 0 }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="calendar-grid">
            {week.map((day) => {
              const dayEvents = eventsOnDay(events, day);
              const inMonth = isSameMonth(day, anchor);
              const visible = dayEvents.slice(0, MAX_VISIBLE);
              const overflow = dayEvents.length - visible.length;

              return (
                <div
                  key={day.toISOString()}
                  className={`calendar-day ${inMonth ? "" : "muted"}`}
                  style={{ minHeight: 0 }}
                >
                  <button
                    onClick={() => onPickDay(day)}
                    className={`calendar-date ${isToday(day) ? "today" : ""}`}
                    style={{ border: 0, background: isToday(day) ? undefined : "transparent", fontWeight: 600 }}
                  >
                    {format(day, "d")}
                  </button>

                  <div className="calendar-day-body">
                    {visible.map((ev) => {
                      const tone = courseTone(courseById.get(ev.courseId ?? "")?.color);
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onSelect(ev.id)}
                          className={`calendar-event-chip ${ev.status === "done" ? "is-done" : ""}`}
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          <span className="calendar-event-chip-dot" style={{ background: tone.solid }} />
                          <span className="tabular-nums" style={{ opacity: 0.75 }}>
                            {format(new Date(ev.start), "h:mm")}
                          </span>
                          <span className="truncate">{ev.title}</span>
                        </button>
                      );
                    })}
                    {overflow > 0 && (
                      <button onClick={() => onPickDay(day)} className="calendar-more-link">
                        +{overflow} more
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
