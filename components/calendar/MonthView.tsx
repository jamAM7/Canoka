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
    <div className="flex flex-col flex-1 min-h-0">
      <div className="grid grid-cols-7 gap-0 border-b border-border bg-background text-sm text-text-muted">
        {WEEKDAYS.map((d) => (
          <div key={d} className="py-2 text-center font-medium">
            {d}
          </div>
        ))}
      </div>

      <div className="grid flex-1 min-h-0" style={{ gridTemplateRows: `repeat(${weeks.length}, 1fr)` }}>
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-0">
            {week.map((day) => {
              const dayEvents = eventsOnDay(events, day);
              const inMonth = isSameMonth(day, anchor);
              const visible = dayEvents.slice(0, MAX_VISIBLE);
              const overflow = dayEvents.length - visible.length;

              return (
                <div key={day.toISOString()} className={`p-2 min-h-0 border-r border-border-light ${inMonth ? "bg-transparent" : "opacity-60"}`}>
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
                      return (
                        <button
                          key={ev.id}
                          onClick={() => onSelect(ev.id)}
                          className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm text-left truncate`}
                          style={{ background: tone.bg, color: tone.fg }}
                        >
                          <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.solid }} />
                          <span className="tabular-nums text-xs opacity-75">{format(new Date(ev.start), "h:mm")}</span>
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
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
