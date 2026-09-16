import type { CalendarEvent, KanbanBoard } from "@/types/calendar";
import { STATUS_ORDER } from "./event-utils";

// Until Supabase is wired up, the calendar keeps the student's edits (new
// tasks, card details, moves, board columns) in this browser's localStorage.
// Bump the key's version if the saved shape changes incompatibly.
const KEY = "canoka.calendar.v1";

export interface SavedCalendar {
  events: CalendarEvent[];
  board: KanbanBoard;
}

export function loadCalendar(): SavedCalendar | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!Array.isArray(data?.events) || !isBoard(data?.board)) return null;
    return { events: data.events, board: data.board };
  } catch {
    return null;
  }
}

export function saveCalendar(state: SavedCalendar): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full: keep working in memory for this session.
  }
}

function isBoard(value: unknown): value is KanbanBoard {
  const board = value as KanbanBoard | null;
  return (
    !!board &&
    Array.isArray(board.columns) &&
    typeof board.order === "object" &&
    board.order !== null &&
    STATUS_ORDER.every((s) => board.columns.some((c) => c.status === s))
  );
}
