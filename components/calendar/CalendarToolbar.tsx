"use client";

import { useState } from "react";
import type { CalendarEventType, Course } from "@/types/calendar";
import { courseTone } from "@/lib/calendar/colors";
import { ChevronIcon } from "@/components/shell/icons";

interface Props {
  period: { title: string; subtitle?: string };
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  showNav: boolean;
  courses: Course[];
  hiddenCourses: Set<string>;
  onToggleCourse: (id: string) => void;
  types: CalendarEventType[];
  hiddenTypes: Set<CalendarEventType>;
  onToggleType: (t: CalendarEventType) => void;
}

// The three sources the calendar merges together (see README): the UTS
// timetable, Canvas-derived assessment deadlines, and the student's own /
// AI-generated tasks. A diamond marks the two Canvas-shaped sources, a circle
// the personal one — matching how they read on the calendar itself.
const SOURCES: { type: CalendarEventType; label: string; mark: "diamond" | "circle" }[] = [
  { type: "class", label: "University Timetable", mark: "diamond" },
  { type: "assessment", label: "Assessment Schedule", mark: "diamond" },
  { type: "task", label: "Personal Calendar", mark: "circle" },
];

export function CalendarToolbar(props: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <header className="flex flex-col gap-3 border-b border-border bg-background px-6 py-5">
      <div className="relative flex min-h-10 items-center justify-center">
        {props.showNav && (
          <div className="absolute left-0 flex items-center gap-1">
            <button
              onClick={props.onPrev}
              aria-label="Previous"
              className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <ChevronIcon dir="left" />
            </button>
            <button
              onClick={props.onToday}
              className="rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted"
            >
              Today
            </button>
            <button
              onClick={props.onNext}
              aria-label="Next"
              className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
            >
              <ChevronIcon dir="right" />
            </button>
          </div>
        )}

        <div className="text-center">
          <div className="text-xl font-semibold text-text">{props.period.title}</div>
          {props.period.subtitle && (
            <div className="text-sm text-text-muted">{props.period.subtitle}</div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SOURCES.map((s) => {
            const active = !props.hiddenTypes.has(s.type);
            return (
              <button
                key={s.type}
                onClick={() => props.onToggleType(s.type)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-border bg-surface text-text"
                    : "border-border bg-surface text-text-muted"
                }`}
                aria-pressed={active}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    s.mark === "diamond" ? "rotate-45 rounded-sm" : ""
                  }`}
                  style={{
                    background: active ? "#023047" : "#D9DFDF",
                  }}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="relative">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted"
          >
            Courses
            {props.hiddenCourses.size > 0 && (
              <span className="inline-flex min-h-[18px] items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-white">
                {props.courses.length - props.hiddenCourses.size}/{props.courses.length}
              </span>
            )}
          </button>

          {filtersOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setFiltersOpen(false)} />
              <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-border bg-surface p-2 shadow-md">
                {props.courses.map((c) => (
                  <label
                    key={c.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm text-text transition-colors hover:bg-surface-muted"
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-primary"
                      checked={!props.hiddenCourses.has(c.id)}
                      onChange={() => props.onToggleCourse(c.id)}
                    />
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ background: courseTone(c.color).solid }}
                    />
                    <span>{c.code}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
