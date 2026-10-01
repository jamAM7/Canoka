"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import type { CalendarViewMode } from "@/types/calendar";
import {
  CalendarIcon,
  DashboardIcon,
  GearIcon,
  KanbanIcon,
  MonthViewIcon,
  NotesIcon,
  PanelIcon,
  WeekViewIcon,
} from "./icons";

type Section = "dashboard" | "notes" | "calendar" | "settings";

interface Props {
  active: Section;
  /** Present only on the calendar page — renders the Week / Month / Kanban sub-nav. */
  calendarView?: CalendarViewMode;
  onCalendarViewChange?: (v: CalendarViewMode) => void;
}

const CALENDAR_VIEWS: { key: CalendarViewMode; label: string; icon: ReactNode }[] = [
  { key: "week", label: "Week", icon: <WeekViewIcon /> },
  { key: "month", label: "Month", icon: <MonthViewIcon /> },
  { key: "kanban", label: "Kanban", icon: <KanbanIcon /> },
];

const BASE_LINK =
  "flex min-h-[36px] items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors";
const IDLE_LINK = "text-text-muted hover:bg-surface-muted hover:text-text";

// Every page renders its own Sidebar, so whether it is collapsed lives out
// here, and in localStorage, to carry across navigation and reloads.
const COLLAPSED_KEY = "canoka.sidebar.collapsed";
let collapsedValue: boolean | null = null;
const listeners = new Set<() => void>();

function getCollapsed(): boolean {
  if (collapsedValue === null) {
    try {
      collapsedValue = window.localStorage.getItem(COLLAPSED_KEY) === "1";
    } catch {
      collapsedValue = false;
    }
  }
  return collapsedValue;
}

function setCollapsed(value: boolean): void {
  collapsedValue = value;
  try {
    window.localStorage.setItem(COLLAPSED_KEY, value ? "1" : "0");
  } catch {
    // Storage blocked: keep the choice in memory until the page reloads.
  }
  listeners.forEach((notify) => notify());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function Sidebar({ active, calendarView, onCalendarViewChange }: Props) {
  // The server can't read localStorage, so it always renders the sidebar expanded.
  const collapsed = useSyncExternalStore(subscribe, getCollapsed, () => false);
  const label = collapsed ? "sr-only" : undefined;

  // 75px collapsed = an 18px icon with the same side padding as expanded, plus
  // the 1px border, so icons keep their horizontal position.
  return (
    <aside
      className={`flex h-full ${collapsed ? "w-[75px]" : "w-[240px]"} shrink-0 flex-col border-r border-border bg-surface px-4 py-5`}
    >
      {/* Collapsed, the toggle drops below the logo: the strip is too narrow for both. */}
      <div className={`mb-10 flex items-center ${collapsed ? "flex-col gap-2" : "justify-between"}`}>
        <Link href="/dashboard" className="flex items-center gap-3 text-decoration-none">
          <span className="grid h-[34px] w-[34px] place-items-center rounded-full bg-primary text-xs font-bold text-white">
            CA
          </span>
          <span className={`text-lg font-bold text-primary ${label ?? ""}`}>Canoka</span>
        </Link>

        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        >
          <PanelIcon />
        </button>
      </div>

      <nav className="space-y-2">
        <NavLink href="/dashboard" label="Dashboard" icon={<DashboardIcon />} active={active === "dashboard"} collapsed={collapsed} />
        <NavLink href="/notes" label="Notes" icon={<NotesIcon />} active={active === "notes"} collapsed={collapsed} />
        <NavLink href="/calendar" label="Calendar" icon={<CalendarIcon />} active={active === "calendar"} collapsed={collapsed} />

        {/* Collapsed, the views show as icons so the calendar can still switch between them. */}
        {active === "calendar" && onCalendarViewChange && (
          <div
            className={
              collapsed
                ? "mt-2 space-y-1 border-t border-border-light pt-2"
                : "ml-6 mt-2 space-y-1 border-l border-border-light pl-4"
            }
          >
            {CALENDAR_VIEWS.map((v) => {
              const current = calendarView === v.key;
              return (
                <button
                  key={v.key}
                  onClick={() => onCalendarViewChange(v.key)}
                  title={collapsed ? v.label : undefined}
                  className={`w-full min-h-[36px] rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                    collapsed ? "grid place-items-center" : "block text-left"
                  } ${current ? "text-primary" : IDLE_LINK} ${current && collapsed ? "bg-primary-light/20" : ""}`}
                >
                  {collapsed && v.icon}
                  <span className={label}>{v.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </nav>

      <div className="mt-auto pt-4">
        <NavLink href="/settings" label="Settings" icon={<GearIcon />} active={active === "settings"} collapsed={collapsed} />
      </div>
    </aside>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
  collapsed,
}: {
  href: string;
  label: string;
  icon: ReactNode;
  active: boolean;
  collapsed: boolean;
}) {
  return (
    <Link
      href={href}
      title={collapsed ? label : undefined}
      className={`${BASE_LINK} ${active ? "bg-surface-muted text-primary" : IDLE_LINK}`}
    >
      {icon}
      <span className={collapsed ? "sr-only" : undefined}>{label}</span>
    </Link>
  );
}
