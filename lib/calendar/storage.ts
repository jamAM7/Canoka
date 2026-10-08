import type { CalendarEvent, KanbanBoard } from "@/types/calendar";
import { STATUS_ORDER } from "./event-utils";

// Until Supabase is wired up, the calendar keeps the student's edits (new
// tasks, card details, moves, board columns) in this browser's localStorage.
//
// Only the changes are stored, not the whole event list. On load they're laid
// back over the events the page was given, the assessments from the last
// Canvas scrape, so a new scrape's due dates and assessments still come
// through instead of a copy saved before it.
// Bump the key's version if the saved shape changes incompatibly.
const KEY = "canoka.calendar.v2";
const OLD_KEY = "canoka.calendar.v1";

export interface CalendarState {
  events: CalendarEvent[];
  board: KanbanBoard;
}

/** Changed fields of one event; `null` marks a field the student cleared. */
type Patch = Record<string, unknown>;

interface SavedChanges {
  edited: Record<string, Patch>;
  removed: string[];
  added: CalendarEvent[];
  board: KanbanBoard;
}

/** `base` is the event list the page was rendered with. */
export function loadCalendar(base: CalendarEvent[]): CalendarState | null {
  try {
    const changes = readChanges();
    return changes && applyChanges(base, changes);
  } catch {
    return null;
  }
}

export function saveCalendar(base: CalendarEvent[], state: CalendarState): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(diff(base, state)));
  } catch {
    // Storage blocked or full: keep working in memory for this session.
  }
}

function readChanges(): SavedChanges | null {
  const raw = window.localStorage.getItem(KEY);
  if (raw) {
    const data = JSON.parse(raw);
    return isChanges(data) ? data : null;
  }
  return migrateOldCopy();
}

// v1 saved the whole event list, back when it was mock data. Keep the board and
// the tasks the student added (createTask ids start "task-"); the mock events,
// and edits to them, belong to no real subject.
function migrateOldCopy(): SavedChanges | null {
  const raw = window.localStorage.getItem(OLD_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.events) || !isBoard(data?.board)) return null;

  const changes: SavedChanges = {
    edited: {},
    removed: [],
    added: data.events.filter((ev: { id?: unknown }) => String(ev?.id).startsWith("task-")),
    board: data.board,
  };
  window.localStorage.setItem(KEY, JSON.stringify(changes));
  window.localStorage.removeItem(OLD_KEY);
  return changes;
}

function diff(base: CalendarEvent[], state: CalendarState): SavedChanges {
  const baseById = new Map(base.map((ev) => [ev.id, ev]));
  const kept = new Set(state.events.map((ev) => ev.id));
  const edited: Record<string, Patch> = {};
  const added: CalendarEvent[] = [];

  for (const ev of state.events) {
    const orig = baseById.get(ev.id);
    if (!orig) {
      added.push(ev);
      continue;
    }
    const patch: Patch = {};
    const keys = Object.keys(orig).concat(Object.keys(ev));
    for (const key of keys.filter((k, i) => keys.indexOf(k) === i)) {
      const before = orig[key as keyof CalendarEvent];
      const after = ev[key as keyof CalendarEvent];
      if (JSON.stringify(before) !== JSON.stringify(after)) patch[key] = after ?? null;
    }
    if (Object.keys(patch).length) edited[ev.id] = patch;
  }

  return {
    edited,
    removed: base.filter((ev) => !kept.has(ev.id)).map((ev) => ev.id),
    added,
    board: state.board,
  };
}

function applyChanges(base: CalendarEvent[], changes: SavedChanges): CalendarState {
  const removed = new Set(changes.removed);
  const events = base
    .filter((ev) => !removed.has(ev.id))
    .map((ev) => {
      const patch = changes.edited[ev.id];
      if (!patch) return ev;
      const next: Record<string, unknown> = { ...ev };
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) delete next[key];
        else next[key] = value;
      }
      return next as unknown as CalendarEvent;
    });
  return { events: [...events, ...changes.added], board: changes.board };
}

function isChanges(value: unknown): value is SavedChanges {
  const data = value as SavedChanges | null;
  return (
    !!data &&
    typeof data.edited === "object" &&
    data.edited !== null &&
    Array.isArray(data.removed) &&
    Array.isArray(data.added) &&
    isBoard(data.board)
  );
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
