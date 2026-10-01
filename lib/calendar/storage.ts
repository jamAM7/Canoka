import type { CalendarEvent, KanbanBoard } from "@/types/calendar";
import { STATUS_ORDER } from "./event-utils";

// The calendar's events come from Supabase, but the student's edits (card
// details, moves, rescheduling, tasks they add, board columns) stay in this
// browser's localStorage until they're written back to the database.
//
// What's saved is only what the student changed, so the server's copy still
// wins for everything else: a new due date or a renamed assessment in Canvas
// shows up even on an event the student has edited. Bump the key's version if
// the saved shape changes incompatibly.
const KEY = "canoka.calendar.v2";
/** Mock-data era: whole events. Only the student's own tasks and the board carry over. */
const OLD_KEY = "canoka.calendar.v1";

/** The fields a student can change on an event from the server. */
const EDITABLE = [
  "title",
  "status",
  "start",
  "end",
  "dueDate",
  "notes",
  "priority",
  "labels",
  "checklist",
] as const satisfies readonly (keyof CalendarEvent)[];

export interface SavedCalendar {
  events: CalendarEvent[];
  board: KanbanBoard;
}

interface Stored {
  /** Events the student made, which the server doesn't know about. */
  added: CalendarEvent[];
  /** Changed fields, by the id of the server event they apply to. */
  edits: Record<string, Partial<CalendarEvent>>;
  /** Server events the student deleted. */
  removed: string[];
  board: KanbanBoard;
}

/** The server's events with this browser's edits applied, or null if nothing is saved. */
export function loadCalendar(server: CalendarEvent[]): SavedCalendar | null {
  try {
    const stored = readStored() ?? readOld();
    if (!stored) return null;
    const removed = new Set(stored.removed);
    const serverIds = new Set(server.map((ev) => ev.id));
    const events = server
      .filter((ev) => !removed.has(ev.id))
      .map((ev) => ({ ...ev, ...stored.edits[ev.id] }))
      .concat(stored.added.filter((ev) => !serverIds.has(ev.id)));
    return { events, board: stored.board };
  } catch {
    return null;
  }
}

/** Saves how `state` differs from the server's events. */
export function saveCalendar(server: CalendarEvent[], state: SavedCalendar): void {
  const byId = new Map(server.map((ev) => [ev.id, ev]));
  const current = new Set(state.events.map((ev) => ev.id));
  const stored: Stored = {
    added: state.events.filter((ev) => !byId.has(ev.id)),
    edits: {},
    removed: server.filter((ev) => !current.has(ev.id)).map((ev) => ev.id),
    board: state.board,
  };
  for (const ev of state.events) {
    const original = byId.get(ev.id);
    if (!original) continue;
    const patch: Partial<CalendarEvent> = {};
    for (const field of EDITABLE) {
      if (JSON.stringify(ev[field]) !== JSON.stringify(original[field])) {
        (patch as Record<string, unknown>)[field] = ev[field];
      }
    }
    if (Object.keys(patch).length > 0) stored.edits[ev.id] = patch;
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(stored));
  } catch {
    // Storage blocked or full: keep working in memory for this session.
  }
}

function readStored(): Stored | null {
  const raw = window.localStorage.getItem(KEY);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!isBoard(data?.board) || !Array.isArray(data?.added) || !Array.isArray(data?.removed)) return null;
  const edits = data.edits && typeof data.edits === "object" && !Array.isArray(data.edits) ? data.edits : {};
  return { added: data.added, edits, removed: data.removed, board: data.board };
}

/** v1 saved whole mock events. Keep the tasks the student added from the board (ids "task-…"), and the board. */
function readOld(): Stored | null {
  const raw = window.localStorage.getItem(OLD_KEY);
  if (!raw) return null;
  const data = JSON.parse(raw);
  if (!Array.isArray(data?.events) || !isBoard(data?.board)) return null;
  const added = (data.events as CalendarEvent[]).filter(
    (ev) => typeof ev?.id === "string" && ev.id.startsWith("task-") && !ev.parentId,
  );
  return { added, edits: {}, removed: [], board: data.board };
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
