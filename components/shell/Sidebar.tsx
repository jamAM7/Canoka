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
  const baseLink =
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-border bg-surface px-4 py-5">
      <Link href="/dashboard" className="mb-10 flex items-center gap-3 text-decoration-none">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-primary text-xs font-bold text-white">
          CA
        </span>
        <span className="text-lg font-bold text-primary">Canoka</span>
      </Link>

      <nav className="space-y-2">
        <Link
          href="/dashboard"
          className={`${baseLink} ${
            active === "dashboard"
              ? "bg-surface-muted text-primary"
              : "text-text-muted hover:bg-surface-muted hover:text-text"
          }`}
        >
          <DashboardIcon />
          Dashboard
        </Link>

        <Link
          href="/notes"
          className={`${baseLink} ${
            active === "notes"
              ? "bg-surface-muted text-primary"
              : "text-text-muted hover:bg-surface-muted hover:text-text"
          }`}
        >
          <NotesIcon />
          Notes
        </Link>

        <Link
          href="/calendar"
          className={`${baseLink} ${
            active === "calendar"
              ? "bg-surface-muted text-primary"
              : "text-text-muted hover:bg-surface-muted hover:text-text"
          }`}
        >
          <CalendarIcon />
          Calendar
        </Link>

        {active === "calendar" && onCalendarViewChange && (
          <div className="ml-6 mt-2 space-y-1 border-l border-border-light pl-4">
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => onCalendarViewChange(v.key)}
                className={`block w-full min-h-[36px] rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  calendarView === v.key
                    ? "text-primary"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="mt-auto pt-4">
        <Link
          href="/settings"
          className={`${baseLink} ${
            active === "settings"
              ? "bg-surface-muted text-primary"
              : "text-text-muted hover:bg-surface-muted hover:text-text"
          }`}
          aria-label="Settings"
        >
          <GearIcon />
          Settings
        </Link>
      </div>
    </aside>
  );
}
