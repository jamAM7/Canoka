"use client";

import Link from "next/link";
import type { CalendarViewMode } from "@/types/calendar";
import { CalendarIcon, DashboardIcon, GearIcon, NotesIcon } from "./icons";

type Section = "dashboard" | "notes" | "calendar" | "settings";

interface Props {
  active: Section;
  /** Present only on the calendar page — renders the Week / Month / Kanban sub-nav. */
  calendarView?: CalendarViewMode;
  onCalendarViewChange?: (v: CalendarViewMode) => void;
}

const CALENDAR_VIEWS: { key: CalendarViewMode; label: string }[] = [
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
  { key: "kanban", label: "Kanban" },
];

export function Sidebar({ active, calendarView, onCalendarViewChange }: Props) {
  return (
    <aside className="sidebar">
      <Link href="/dashboard" className="brand-mark">
        <span className="brand-mark-badge">CA</span>
        <span className="brand-mark-word">Canoka</span>
      </Link>

      <nav className="nav">
        <Link href="/dashboard" className={`nav-link ${active === "dashboard" ? "active" : ""}`}>
          <DashboardIcon />
          Dashboard
        </Link>

        <Link href="/notes" className={`nav-link ${active === "notes" ? "active" : ""}`}>
          <NotesIcon />
          Notes
        </Link>

        <Link href="/calendar" className={`nav-link ${active === "calendar" ? "active" : ""}`}>
          <CalendarIcon />
          Calendar
        </Link>

        {active === "calendar" && onCalendarViewChange && (
          <div className="nav-sublist">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => onCalendarViewChange(v.key)}
                className={`nav-sublink ${calendarView === v.key ? "active" : ""}`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="sidebar-bottom">
        <Link
          href="/settings"
          className={`nav-link ${active === "settings" ? "active" : ""}`}
          aria-label="Settings"
        >
          <GearIcon />
          Settings
        </Link>
      </div>
    </aside>
  );
}
