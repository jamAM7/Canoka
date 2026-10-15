"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { CalendarEventType, CalendarViewMode, Course } from "@/types/calendar";
import { courseTone } from "@/types/calendar";
import { ChevronIcon, KanbanIcon, MonthViewIcon, WeekViewIcon } from "@/components/shell/icons";
import { GenerateSubtasksButton } from "./GenerateSubtasksButton";

interface Props {
  period: { title: string; subtitle?: string };
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  view: CalendarViewMode;
  onViewChange: (v: CalendarViewMode) => void;
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

const VIEWS: { key: CalendarViewMode; label: string; icon: ReactNode }[] = [
  { key: "week", label: "Week", icon: <WeekViewIcon className="h-4 w-4" /> },
  { key: "month", label: "Month", icon: <MonthViewIcon className="h-4 w-4" /> },
  { key: "kanban", label: "Kanban", icon: <KanbanIcon className="h-4 w-4" /> },
];

export function CalendarToolbar(props: Props) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const coursesButtonRef = useRef<HTMLButtonElement | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!filtersOpen || !coursesButtonRef.current) return;

    const updatePosition = () => {
      const rect = coursesButtonRef.current!.getBoundingClientRect();
      setMenuPosition({
        top: rect.bottom + 8,
        left: Math.max(12, Math.min(rect.right - 256, window.innerWidth - 272)),
      });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);
    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [filtersOpen]);

  return (
    <header className="relative z-0 flex min-h-[182px] flex-col border-b border-border bg-background px-8 py-4 md:px-10">
      <div className="relative z-0 flex h-[78px] items-center justify-center">
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

        <div className="flex min-w-0 flex-col items-center justify-center text-center">
          <div className="text-3xl font-semibold leading-none tracking-tight text-text md:text-4xl">
            {props.period.title}
          </div>
          <div className="mt-1 flex min-h-[1.25rem] items-center justify-center text-sm text-text-muted">
            {props.period.subtitle ?? "\u00A0"}
          </div>
        </div>

        <div className="absolute right-0 flex items-center gap-1" role="group" aria-label="Calendar view">
          {VIEWS.map((v) => {
            const current = props.view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => props.onViewChange(v.key)}
                aria-pressed={current}
                className={`inline-flex items-center gap-1.5 rounded-sm px-3 py-1.5 text-sm font-medium transition-colors ${
                  current
                    ? "bg-primary-light/20 text-primary"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                {v.icon}
                {v.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex min-h-[56px] flex-wrap items-start justify-between gap-3 pt-1">
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
                    background: active ? "var(--color-primary)" : "var(--color-border)",
                  }}
                />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-start gap-3">
          <GenerateSubtasksButton />
          <div className="relative">
            <button
              ref={coursesButtonRef}
              onClick={() => setFiltersOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted"
            >
              Courses
              {props.hiddenCourses.size > 0 && (
                <span className="inline-flex min-h-[18px] items-center rounded-full bg-primary px-1.5 text-[10px] font-semibold text-on-primary">
                  {props.courses.length - props.hiddenCourses.size}/{props.courses.length}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {filtersOpen && menuPosition && typeof document !== "undefined" && createPortal(
        <>
          <div className="fixed inset-0 z-40" onClick={() => setFiltersOpen(false)} />
          <div
            className="fixed z-50 w-64 rounded-xl border border-border bg-surface p-2 shadow-md"
            style={{ top: menuPosition.top, left: menuPosition.left }}
          >
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
        </>,
        document.body,
      )}
    </header>
  );
}
