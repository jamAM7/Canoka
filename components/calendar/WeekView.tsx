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

interface Props {
  anchor: Date;
  events: ScheduledEvent[];
  courseById: Map<string, Course>;
  onSelect: (id: string) => void;
}

const GRID_COLUMNS = "72px repeat(7, minmax(140px, 1fr))";
const HOURS = Array.from(
  { length: DAY_END_HOUR - DAY_START_HOUR + 1 },
  (_, i) => DAY_START_HOUR + i,
);

const formatHourLabel = (hour: number) => {
  const normalized = hour % 12 || 12;
  const suffix = hour >= 12 ? "pm" : "am";
  return `${normalized}${suffix}`;
};

const isWeekend = (day: Date) => day.getDay() === 0 || day.getDay() === 6;

export function WeekView({ anchor, events, courseById, onSelect }: Props) {
  const weekStart = startOfWeek(anchor, WEEK_OPTS);
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = Math.max(0, 8 * HOUR_ROW_PX - 12);
    }
  }, [anchor]);

  const booked = events.filter((ev) => ev.type !== "assessment");
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
      <div className="min-w-[980px]">
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

          {days.map((day) => {
            const laid = layoutDayColumn(eventsOnDay(booked, day));
            return (
              <div
                key={day.toISOString()}
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
                      className="absolute overflow-hidden rounded-md border px-2 py-1 text-left text-sm"
                    >
                      <div className="truncate font-medium">{event.title}</div>
                      <div className="truncate text-xs opacity-75">{formatEventTime(event)}</div>
                      {event.location && <div className="truncate text-xs opacity-75">{event.location}</div>}
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

  const label = format(now, "h:mm a");
  return (
    <div className="time-grid-now-line" style={{ top }} title={label} aria-label={label}>
      <div className="time-grid-now-dot" />
      <div className="time-grid-now-track" />
    </div>
  );
}
