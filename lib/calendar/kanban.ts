import { addHours, startOfHour } from "date-fns";
import type {
  CalendarEvent,
  ChecklistItem,
  KanbanBoard,
  TaskPriority,
  TaskStatus,
} from "@/types/calendar";
import { STATUS_META, STATUS_ORDER } from "./event-utils";

// ---------------------------------------------------------------------------
// Kanban board state
//
// The board keeps its own column list and card order, separate from the
// events. Where a card appears is resolved from both: a card stays where it
// was dropped while its status matches that column's status, and otherwise
// falls to the first column for its status. That way a status change made
// from the calendar's detail panel still moves the card on the board.
// ---------------------------------------------------------------------------

export const DEFAULT_BOARD: KanbanBoard = {
  columns: STATUS_ORDER.map((status) => ({
    id: status,
    title: STATUS_META[status].label,
    status,
  })),
  order: {},
};

export const PRIORITY_ORDER: TaskPriority[] = ["low", "medium", "high"];

export const PRIORITY_META: Record<TaskPriority, { label: string }> = {
  low: { label: "Low" },
  medium: { label: "Medium" },
  high: { label: "High" },
};

/** Classes have no status, so only assessments and tasks go on the board. */
export function isBoardCard(ev: CalendarEvent): boolean {
  return ev.type === "assessment" || ev.type === "task";
}

export function statusOf(ev: CalendarEvent): TaskStatus {
  return ev.status ?? "coming_up";
}

function byDue(a: CalendarEvent, b: CalendarEvent): number {
  return +new Date(a.dueDate ?? a.start) - +new Date(b.dueDate ?? b.start);
}

/** Cards per column id, in board order. Unplaced cards are appended by due date. */
export function resolveBoard(
  events: CalendarEvent[],
  board: KanbanBoard,
): Map<string, CalendarEvent[]> {
  const cards = events.filter(isBoardCard);
  const byId = new Map(cards.map((ev) => [ev.id, ev]));
  const result = new Map(board.columns.map((col) => [col.id, [] as CalendarEvent[]]));
  const placed = new Set<string>();

  for (const col of board.columns) {
    for (const id of board.order[col.id] ?? []) {
      const ev = byId.get(id);
      if (ev && !placed.has(id) && statusOf(ev) === col.status) {
        result.get(col.id)!.push(ev);
        placed.add(id);
      }
    }
  }

  for (const ev of cards.filter((c) => !placed.has(c.id)).sort(byDue)) {
    const col =
      board.columns.find((c) => c.status === statusOf(ev)) ?? board.columns[0];
    result.get(col.id)!.push(ev);
  }
  return result;
}

/**
 * Place a card in a column, before `beforeId` or at the end. The caller also
 * sets the card's status to the column's status.
 */
export function moveCard(
  events: CalendarEvent[],
  board: KanbanBoard,
  cardId: string,
  toColumnId: string,
  beforeId: string | null,
): KanbanBoard {
  const resolved = resolveBoard(events, board);
  const order: Record<string, string[]> = {};

  for (const col of board.columns) {
    const ids = (resolved.get(col.id) ?? [])
      .map((ev) => ev.id)
      .filter((id) => id !== cardId);
    if (col.id === toColumnId) {
      const at = beforeId ? ids.indexOf(beforeId) : -1;
      ids.splice(at === -1 ? ids.length : at, 0, cardId);
    }
    order[col.id] = ids;
  }
  return { ...board, order };
}

/**
 * Every status keeps at least one column so a card always has somewhere to
 * go; that last column can't be deleted or switched to another status.
 */
export function isOnlyColumnFor(board: KanbanBoard, columnId: string): boolean {
  const col = board.columns.find((c) => c.id === columnId);
  return !!col && board.columns.filter((c) => c.status === col.status).length === 1;
}

export function addColumn(board: KanbanBoard, title: string, status: TaskStatus): KanbanBoard {
  const id = newId("col");
  return {
    columns: [...board.columns, { id, title, status }],
    order: { ...board.order, [id]: [] },
  };
}

export function renameColumn(board: KanbanBoard, columnId: string, title: string): KanbanBoard {
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, title } : c)),
  };
}

/** The caller moves the column's cards to the new status as well. */
export function setColumnStatus(
  board: KanbanBoard,
  columnId: string,
  status: TaskStatus,
): KanbanBoard {
  if (isOnlyColumnFor(board, columnId)) return board;
  return {
    ...board,
    columns: board.columns.map((c) => (c.id === columnId ? { ...c, status } : c)),
  };
}

/** Its cards keep their status and fall to another column with that status. */
export function removeColumn(board: KanbanBoard, columnId: string): KanbanBoard {
  if (isOnlyColumnFor(board, columnId)) return board;
  const order = { ...board.order };
  delete order[columnId];
  return { columns: board.columns.filter((c) => c.id !== columnId), order };
}

export function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** A student task added from the board, booked for the next full hour so it shows in the calendar. */
export function createTask(title: string, status: TaskStatus, now: Date = new Date()): CalendarEvent {
  const start = startOfHour(addHours(now, 1));
  return {
    id: newId("task"),
    title,
    type: "task",
    status,
    start: start.toISOString(),
    end: addHours(start, 1).toISOString(),
  };
}

export function checklistProgress(
  items: ChecklistItem[] | undefined,
): { done: number; total: number } | null {
  if (!items?.length) return null;
  return { done: items.filter((item) => item.done).length, total: items.length };
}
