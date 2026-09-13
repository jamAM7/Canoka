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
    <header className="topbar calendar-topbar">
      <div className="calendar-topbar-title-row">
        {props.showNav && (
          <div className="calendar-topbar-nav at-edge">
            <button onClick={props.onPrev} aria-label="Previous" className="icon-btn">
              <ChevronIcon dir="left" />
            </button>
            <button onClick={props.onToday} className="btn btn-outline btn-small">
              Today
            </button>
            <button onClick={props.onNext} aria-label="Next" className="icon-btn">
              <ChevronIcon dir="right" />
            </button>
          </div>
        )}

        <div className="calendar-period">
          <div className="calendar-period-title">{props.period.title}</div>
          {props.period.subtitle && (
            <div className="calendar-period-subtitle">{props.period.subtitle}</div>
          )}
        </div>
      </div>

      <div className="calendar-sources-row">
        <div className="source-toggles">
          {SOURCES.map((s) => {
            const active = !props.hiddenTypes.has(s.type);
            return (
              <button
                key={s.type}
                onClick={() => props.onToggleType(s.type)}
                className={`source-toggle ${active ? "active" : ""}`}
                aria-pressed={active}
              >
                <span className={`source-toggle-mark ${s.mark}`} />
                {s.label}
              </button>
            );
          })}
        </div>

        <div className="course-filter">
          <button
            onClick={() => setFiltersOpen((o) => !o)}
            className="btn btn-ghost btn-small"
          >
            Courses
            {props.hiddenCourses.size > 0 && (
              <span className="badge badge-primary" style={{ minHeight: 18, padding: "0 6px" }}>
                {props.courses.length - props.hiddenCourses.size}/{props.courses.length}
              </span>
            )}
          </button>

          {filtersOpen && (
            <>
              <div className="fixed inset-0" style={{ position: "fixed", inset: 0, zIndex: 10 }} onClick={() => setFiltersOpen(false)} />
              <div className="course-filter-panel">
                {props.courses.map((c) => (
                  <label key={c.id} className="course-filter-row">
                    <input
                      type="checkbox"
                      className="checkbox-input"
                      checked={!props.hiddenCourses.has(c.id)}
                      onChange={() => props.onToggleCourse(c.id)}
                    />
                    <span
                      className="course-filter-dot"
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
