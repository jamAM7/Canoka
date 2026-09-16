"use client";

import { useState } from "react";
import { format, isPast } from "date-fns";
import type {
  CalendarEvent,
  Course,
  KanbanColumn,
  TaskStatus,
} from "@/types/calendar";
import { STATUS_META, STATUS_ORDER, typeLabel } from "@/lib/calendar/event-utils";
import { checklistProgress } from "@/lib/calendar/kanban";
import { courseTone } from "@/lib/calendar/colors";
import { ChecklistIcon, MoreIcon, NotesIcon, PlusIcon } from "@/components/shell/icons";
import { PriorityTag } from "./PriorityTag";

export interface BoardColumn {
  column: KanbanColumn;
  /** Visible cards (course/type filters applied), in board order. */
  cards: CalendarEvent[];
  /** Only column for its status, so it can't be deleted or switched to another status. */
  locked: boolean;
}

interface Props {
  columns: BoardColumn[];
  courseById: Map<string, Course>;
  onOpen: (id: string) => void;
  onMove: (id: string, columnId: string, beforeId: string | null) => void;
  onAddTask: (columnId: string, title: string) => void;
  onAddColumn: (title: string, status: TaskStatus) => void;
  onRenameColumn: (columnId: string, title: string) => void;
  onChangeColumnStatus: (columnId: string, status: TaskStatus) => void;
  onRemoveColumn: (columnId: string) => void;
}

type DropTarget = { columnId: string; beforeId: string | null };

const PRIMARY_BTN =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark";
const GHOST_BTN =
  "rounded-md px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text";
const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";

// The board shows actionable work only: assessments and tasks. Classes have no
// status and are left to the week/month views. Cards drag between and within
// columns; the card editor's column picker covers keyboard and touch, where
// native drag and drop doesn't work.
export function KanbanView({ columns, courseById, onOpen, onMove, ...actions }: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [drop, setDrop] = useState<DropTarget | null>(null);

  const endDrag = () => {
    setDragId(null);
    setDrop(null);
  };

  const commitDrop = () => {
    // Dropping a card just before itself leaves it where it is.
    if (dragId && drop && drop.beforeId !== dragId) {
      onMove(dragId, drop.columnId, drop.beforeId);
    }
    endDrag();
  };

  return (
    <div className="cb-scroll flex h-full items-start gap-4 overflow-x-auto p-6">
      {columns.map(({ column, cards, locked }) => {
        const isOver = dragId !== null && drop?.columnId === column.id;
        const showLine = (beforeId: string | null) =>
          isOver && drop?.beforeId === beforeId && beforeId !== dragId;

        return (
          <section
            key={column.id}
            aria-label={column.title}
            onDragOver={(e) => {
              if (!dragId) return;
              e.preventDefault();
              setDrop({ columnId: column.id, beforeId: null });
            }}
            onDrop={(e) => {
              e.preventDefault();
              commitDrop();
            }}
            className={`flex max-h-full w-72 shrink-0 flex-col rounded-xl bg-surface-muted transition-shadow ${
              isOver ? "ring-2 ring-primary-light" : ""
            }`}
          >
            <ColumnHeader
              column={column}
              count={cards.length}
              locked={locked}
              onRename={(title) => actions.onRenameColumn(column.id, title)}
              onChangeStatus={(status) => actions.onChangeColumnStatus(column.id, status)}
              onRemove={() => actions.onRemoveColumn(column.id)}
            />

            <div className="cb-scroll flex min-h-0 flex-col gap-2 overflow-y-auto px-2 pb-1">
              {cards.map((ev, i) => (
                <div key={ev.id}>
                  {showLine(ev.id) && <DropLine />}
                  <Card
                    event={ev}
                    course={ev.courseId ? courseById.get(ev.courseId) : undefined}
                    dragging={dragId === ev.id}
                    onDragStart={() => setDragId(ev.id)}
                    onDragEnd={endDrag}
                    onDragOver={(e) => {
                      if (!dragId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      const below = e.clientY > rect.top + rect.height / 2;
                      setDrop({
                        columnId: column.id,
                        beforeId: below ? cards[i + 1]?.id ?? null : ev.id,
                      });
                    }}
                    onOpen={() => onOpen(ev.id)}
                  />
                </div>
              ))}
              {showLine(null) && <DropLine />}
              {cards.length === 0 && !isOver && (
                <p className="px-2 py-6 text-center text-sm text-text-light">No cards yet</p>
              )}
            </div>

            <AddCard onAdd={(title) => actions.onAddTask(column.id, title)} />
          </section>
        );
      })}

      <AddColumn onAdd={actions.onAddColumn} />
    </div>
  );
}

function DropLine() {
  return <div className="mb-2 h-0.5 rounded-full bg-primary" />;
}

function ColumnHeader({
  column,
  count,
  locked,
  onRename,
  onChangeStatus,
  onRemove,
}: {
  column: KanbanColumn;
  count: number;
  locked: boolean;
  onRename: (title: string) => void;
  onChangeStatus: (status: TaskStatus) => void;
  onRemove: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const commitRename = (value: string) => {
    const title = value.trim();
    if (title && title !== column.title) onRename(title);
    setRenaming(false);
  };

  return (
    <header className="flex items-center gap-2 px-3 pb-2 pt-3">
      {renaming ? (
        <input
          autoFocus
          defaultValue={column.title}
          aria-label="Column name"
          onBlur={(e) => commitRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitRename(e.currentTarget.value);
            if (e.key === "Escape") setRenaming(false);
          }}
          className="min-w-0 flex-1 rounded-md border border-primary-light bg-surface px-2 py-1 text-sm font-semibold text-text shadow-focus focus:outline-none"
        />
      ) : (
        <button
          onClick={() => setRenaming(true)}
          title="Rename column"
          className="min-w-0 flex-1 truncate rounded-md px-1 py-1 text-left text-sm font-semibold text-text hover:bg-surface"
        >
          {column.title}
        </button>
      )}

      <span className="grid h-[22px] min-w-[22px] place-items-center rounded-full bg-surface px-2 text-xs font-semibold text-text-muted">
        {count}
      </span>

      <div className="relative">
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label={`${column.title} column options`}
          aria-expanded={menuOpen}
          className="grid h-7 w-7 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text"
        >
          <MoreIcon />
        </button>

        {menuOpen && (
          <>
            <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
            <div className="absolute right-0 z-20 mt-1 w-60 space-y-1 rounded-xl border border-border bg-surface p-2 shadow-md">
              <button
                onClick={() => {
                  setMenuOpen(false);
                  setRenaming(true);
                }}
                className="w-full rounded-md px-2 py-2 text-left text-sm text-text hover:bg-surface-muted"
              >
                Rename
              </button>

              <label className="block px-2 py-1 text-xs font-semibold uppercase tracking-wide text-text-light">
                Counts as
                <select
                  value={column.status}
                  disabled={locked}
                  onChange={(e) => onChangeStatus(e.target.value as TaskStatus)}
                  className={`${FIELD} mt-1 font-regular normal-case tracking-normal disabled:cursor-not-allowed disabled:bg-surface-muted`}
                >
                  {STATUS_ORDER.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_META[s].label}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={() => {
                  setMenuOpen(false);
                  onRemove();
                }}
                disabled={locked}
                className="w-full rounded-md px-2 py-2 text-left text-sm text-error hover:bg-error/10 disabled:cursor-not-allowed disabled:text-text-light disabled:hover:bg-transparent"
              >
                Delete column
              </button>

              <p className="px-2 pb-1 text-xs text-text-light">
                {locked
                  ? `This is the only “${STATUS_META[column.status].label}” column, so it stays.`
                  : `Its cards move to another “${STATUS_META[column.status].label}” column.`}
              </p>
            </div>
          </>
        )}
      </div>
    </header>
  );
}

function Card({
  event,
  course,
  dragging,
  onDragStart,
  onDragEnd,
  onDragOver,
  onOpen,
}: {
  event: CalendarEvent;
  course?: Course;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: React.DragEvent<HTMLElement>) => void;
  onOpen: () => void;
}) {
  const tone = courseTone(course?.color);
  const due = event.dueDate ? new Date(event.dueDate) : null;
  const overdue = due !== null && event.status !== "done" && isPast(due);
  const progress = checklistProgress(event.checklist);

  return (
    <article
      draggable
      role="button"
      tabIndex={0}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", event.id);
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={`cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-sm transition-colors hover:border-primary-light focus:outline-none focus-visible:shadow-focus ${
        dragging ? "opacity-40" : ""
      }`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <span
          className="rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase"
          style={{ background: tone.bg, color: tone.fg }}
        >
          {course?.code ?? typeLabel(event)}
        </span>
        {event.type === "assessment" && (
          <span className="text-[10px] font-semibold uppercase text-text-light">◆ Assessment</span>
        )}
        {event.parentId && (
          <span className="text-[10px] font-semibold uppercase text-text-light">Subtask</span>
        )}
        {event.priority && <PriorityTag priority={event.priority} className="ml-auto" />}
      </div>

      <p className="text-sm font-semibold text-text">{event.title}</p>

      {event.labels && event.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {event.labels.map((label) => (
            <span key={label} className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-text-muted">
              {label}
            </span>
          ))}
        </div>
      )}

      {(due || progress || event.notes) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-medium text-text-muted">
          {due && (
            <span className={overdue ? "text-error" : undefined}>
              {overdue ? "Overdue · " : "Due "}
              {format(due, "EEE d MMM, h:mm a")}
            </span>
          )}
          {progress && (
            <span
              className={`inline-flex items-center gap-1 ${progress.done === progress.total ? "text-success" : ""}`}
              title="Checklist"
            >
              <ChecklistIcon className="h-3.5 w-3.5" />
              {progress.done}/{progress.total}
            </span>
          )}
          {event.notes && (
            <span className="inline-flex items-center" title="Has notes">
              <NotesIcon className="h-3.5 w-3.5" />
              <span className="sr-only">Has notes</span>
            </span>
          )}
        </div>
      )}
    </article>
  );
}

function AddCard({ onAdd }: { onAdd: (title: string) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");

  const close = () => {
    setOpen(false);
    setTitle("");
  };
  const submit = () => {
    const value = title.trim();
    if (value) onAdd(value);
    setTitle("");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="m-2 flex items-center gap-2 rounded-md px-2 py-2 text-sm font-medium text-text-muted transition-colors hover:bg-surface hover:text-text"
      >
        <PlusIcon className="h-4 w-4" />
        Add a card
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-2 p-2"
    >
      <textarea
        autoFocus
        rows={2}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
          if (e.key === "Escape") close();
        }}
        placeholder="What needs doing?"
        aria-label="New card title"
        className={`${FIELD} resize-none shadow-sm`}
      />
      <div className="flex items-center gap-2">
        <button type="submit" className={PRIMARY_BTN}>
          Add card
        </button>
        <button type="button" onClick={close} className={GHOST_BTN}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function AddColumn({ onAdd }: { onAdd: (title: string, status: TaskStatus) => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<TaskStatus>("in_progress");

  const close = () => {
    setOpen(false);
    setTitle("");
    setStatus("in_progress");
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex h-12 w-72 shrink-0 items-center gap-2 rounded-xl border border-dashed border-border px-4 text-sm font-medium text-text-muted transition-colors hover:border-primary-light hover:bg-surface-muted hover:text-text"
      >
        <PlusIcon className="h-4 w-4" />
        Add column
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = title.trim();
        if (!value) return;
        onAdd(value, status);
        close();
      }}
      className="w-72 shrink-0 space-y-3 rounded-xl bg-surface-muted p-3"
    >
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && close()}
        placeholder="Column name"
        aria-label="Column name"
        className={FIELD}
      />
      <label className="block text-xs font-semibold uppercase tracking-wide text-text-light">
        Counts as
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as TaskStatus)}
          className={`${FIELD} mt-1 font-regular normal-case tracking-normal`}
        >
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_META[s].label}
            </option>
          ))}
        </select>
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" className={PRIMARY_BTN}>
          Add column
        </button>
        <button type="button" onClick={close} className={GHOST_BTN}>
          Cancel
        </button>
      </div>
    </form>
  );
}
