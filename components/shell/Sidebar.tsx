"use client";

import Link from "next/link";
import { useSyncExternalStore, type ReactNode } from "react";
import type { CalendarViewMode } from "@/types/calendar";
import { CalendarIcon, ChevronIcon, DashboardIcon, GearIcon, NotesIcon } from "./icons";

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

// Collapsed state lives in localStorage rather than component state because each
// page mounts its own <Sidebar>, so it would otherwise reset on every navigation.
const COLLAPSED_KEY = "canoka.sidebarCollapsed";
const listeners = new Set<() => void>();

function readCollapsed() {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === "1";
  } catch {
    return false;
  }
}

function setCollapsed(value: boolean) {
  try {
    localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked — the toggle just won't persist.
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const baseLink =
  "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors";

function NavLink({
  href,
  isActive,
  collapsed,
  icon,
  label,
}: {
  href: string;
  isActive: boolean;
  collapsed: boolean;
  icon: ReactNode;
  label: string;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`${baseLink} ${collapsed ? "justify-center" : ""} ${
        isActive
          ? "bg-surface-muted font-bold text-primary"
          : "font-medium text-text-muted hover:bg-surface-muted hover:text-text"
      }`}
    >
      {icon}
      <span className={collapsed ? "sr-only" : ""}>{label}</span>
    </Link>
  );
}

export function Sidebar({ active, calendarView, onCalendarViewChange }: Props) {
  // Server snapshot is always "expanded"; the client reads storage after hydration.
  const collapsed = useSyncExternalStore(subscribe, readCollapsed, () => false);

  return (
    <aside
      className={`flex h-full shrink-0 flex-col border-r border-border bg-surface py-5 transition-[width] duration-200 ${
        collapsed ? "w-[72px] px-3" : "w-[208px] px-4"
      }`}
    >
      <div className={`mb-10 flex items-center ${collapsed ? "flex-col gap-3" : "justify-between"}`}>
        <Link href="/dashboard" className="flex items-center gap-3 text-decoration-none">
          <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-white">
            CA
          </span>
          {!collapsed && <span className="text-lg font-bold text-primary">Canoka</span>}
        </Link>
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        >
          <ChevronIcon dir={collapsed ? "right" : "left"} />
        </button>
      </div>

      <nav className="space-y-2">
        <NavLink href="/dashboard" isActive={active === "dashboard"} collapsed={collapsed} icon={<DashboardIcon />} label="Dashboard" />
        <NavLink href="/notes" isActive={active === "notes"} collapsed={collapsed} icon={<NotesIcon />} label="Notes" />
        <NavLink href="/calendar" isActive={active === "calendar"} collapsed={collapsed} icon={<CalendarIcon />} label="Calendar" />

        {active === "calendar" && onCalendarViewChange && (
          <div className={collapsed ? "mt-2 space-y-1" : "ml-6 mt-2 space-y-1 border-l border-border-light pl-4"}>
            {CALENDAR_VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => onCalendarViewChange(v.key)}
                title={collapsed ? v.label : undefined}
                aria-label={v.label}
                className={`block w-full min-h-[36px] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                  collapsed ? "text-center" : "text-left"
                } ${
                  calendarView === v.key
                    ? "text-primary"
                    : "text-text-muted hover:bg-surface-muted hover:text-text"
                }`}
              >
                {collapsed ? v.label[0] : v.label}
              </button>
            ))}
          </div>
        )}
      </nav>

      <div className="mt-auto pt-4">
        <NavLink href="/settings" isActive={active === "settings"} collapsed={collapsed} icon={<GearIcon />} label="Settings" />
      </div>
    </aside>
  );
}
