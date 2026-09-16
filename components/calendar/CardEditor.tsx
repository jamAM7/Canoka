"use client";

import { useId, useState } from "react";
import { format } from "date-fns";
import type {
  CalendarEvent,
  ChecklistItem,
  Course,
  KanbanColumn,
} from "@/types/calendar";
import { formatEventTime, rescheduleEvent, typeLabel } from "@/lib/calendar/event-utils";
import { PRIORITY_META, PRIORITY_ORDER, checklistProgress, newId } from "@/lib/calendar/kanban";
import { courseTone } from "@/lib/calendar/colors";
import { CloseIcon, PlusIcon } from "@/components/shell/icons";
import { PRIORITY_STYLES } from "./PriorityTag";

export interface CardEditorProps {
  event: CalendarEvent;
  courses: Course[];
  parent: CalendarEvent | null;
  subtasks: CalendarEvent[];
  columns: KanbanColumn[];
  columnId: string | null;
  /** "modal": two columns, on the Kanban board. "panel": one column, in the calendar's side panel. */
  layout: "modal" | "panel";
  onClose: () => void;
  onChange: (id: string, patch: Partial<CalendarEvent>) => void;
  onMove: (id: string, columnId: string) => void;
  onDelete: (id: string) => void;
  /** Open another card: the parent assessment or one of its subtasks. */
  onSelect: (id: string) => void;
}

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";
const HEADING = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-text-light";

// Editor for an assessment or task, shared by the Kanban board's card modal
// and the week/month side panel so a card reads and edits the same everywhere.
// Assessments come from Canvas, so their title, subject, due date and time
// stay read-only; the student can still organise them with a column,
// priority, labels, notes, a checklist, and by re-timing their subtasks.
// Tasks, including AI-generated subtasks, are fully editable.
//
// Render with `key={event.id}` so the delete confirmation resets per card.
export function CardEditor({
  event,
  courses,
  parent,
  subtasks,
  columns,
  columnId,
  layout,
  onClose,
  onChange,
  onMove,
  onDelete,
  onSelect,
}: CardEditorProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const uid = useId();

  const isTask = event.type === "task";
  const course = courses.find((c) => c.id === event.courseId);
  const tone = courseTone(course?.color);
  const update = (patch: Partial<CalendarEvent>) => onChange(event.id, patch);

  const details = (
    <>
      <div>
        <label htmlFor={`${uid}-column`} className={HEADING}>
          Column
        </label>
        <select
          id={`${uid}-column`}
          value={columnId ?? ""}
          onChange={(e) => onMove(event.id, e.target.value)}
          className={FIELD}
        >
          {columns.map((col) => (
            <option key={col.id} value={col.id}>
              {col.title}
            </option>
          ))}
        </select>
      </div>

      <div>
        <span className={HEADING}>Priority</span>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Priority">
          <PriorityButton active={!event.priority} onClick={() => update({ priority: undefined })}>
            None
          </PriorityButton>
          {PRIORITY_ORDER.map((p) => (
            <PriorityButton
              key={p}
              active={event.priority === p}
              activeClass={PRIORITY_STYLES[p]}
              onClick={() => update({ priority: p })}
            >
              {PRIORITY_META[p].label}
            </PriorityButton>
          ))}
        </div>
      </div>

      <div>
        <Heading htmlFor={isTask ? `${uid}-course` : undefined}>Subject</Heading>
        {isTask ? (
          <select
            id={`${uid}-course`}
            value={event.courseId ?? ""}
            onChange={(e) => update({ courseId: e.target.value || undefined })}
            className={FIELD}
          >
            <option value="">No subject</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code} · {c.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-sm text-text">
            {course ? `${course.code} · ${course.name}` : "—"}
          </p>
        )}
      </div>

      <div>
        <Heading htmlFor={isTask ? `${uid}-due` : undefined}>Due</Heading>
        {isTask ? (
          <input
            id={`${uid}-due`}
            type="datetime-local"
            value={event.dueDate ? format(new Date(event.dueDate), "yyyy-MM-dd'T'HH:mm") : ""}
            onChange={(e) =>
              update({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : undefined })
            }
            className={FIELD}
          />
        ) : (
          <p className="text-sm text-text">
            {event.dueDate ? format(new Date(event.dueDate), "EEE d MMM, h:mm a") : "—"}
          </p>
        )}
      </div>

      <div>
        <span className={HEADING}>In your calendar</span>
        {isTask ? (
          <ScheduleFields event={event} onChange={onChange} />
        ) : (
          <p className="text-sm text-text">
            {format(new Date(event.start), "EEE d MMM")}, {formatEventTime(event)}
          </p>
        )}
      </div>

      {event.location && (
        <div>
          <span className={HEADING}>Location</span>
          <p className="text-sm text-text">{event.location}</p>
        </div>
      )}
    </>
  );

  const content = (
    <>
      <div>
        <label htmlFor={`${uid}-notes`} className={HEADING}>
          Notes
        </label>
        <textarea
          id={`${uid}-notes`}
          rows={5}
          value={event.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value || undefined })}
          placeholder="Add notes, links or anything useful for this task…"
          className={`${FIELD} resize-y`}
        />
      </div>

      <Checklist
        items={event.checklist ?? []}
        onChange={(items) => update({ checklist: items.length ? items : undefined })}
      />

      <Labels
        id={`${uid}-labels`}
        labels={event.labels ?? []}
        onChange={(labels) => update({ labels: labels.length ? labels : undefined })}
      />

      {subtasks.length > 0 && (
        <Subtasks subtasks={subtasks} onChange={onChange} onSelect={onSelect} />
      )}
    </>
  );

  const deleteSection = isTask && (
    <div className="border-t border-border-light pt-4">
      {confirmDelete ? (
        <div className="space-y-2">
          <p className="text-sm text-text">Delete this task from the board and calendar?</p>
          <div className="flex gap-2">
            <button
              onClick={() => onDelete(event.id)}
              className="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/90"
            >
              Delete
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-md px-2 py-1.5 text-sm font-medium text-error hover:bg-error/10"
        >
          Delete task
        </button>
      )}
    </div>
  );

  return (
    <div className={layout === "panel" ? "flex min-h-0 flex-1 flex-col" : undefined}>
      <header className="flex items-start gap-3 border-b border-border-light p-5">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span
              className="rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase"
              style={{ background: tone.bg, color: tone.fg }}
            >
              {course ? `${course.code} · ` : ""}
              {typeLabel(event)}
            </span>
            {parent && (
              <span className="text-xs text-text-muted">
                Part of{" "}
                <button
                  onClick={() => onSelect(parent.id)}
                  className="font-semibold text-primary hover:underline"
                >
                  {parent.title}
                </button>
              </span>
            )}
          </div>
          {isTask ? (
            <input
              value={event.title}
              onChange={(e) => update({ title: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && update({ title: "Untitled task" })}
              aria-label="Title"
              className="-ml-2 w-full rounded-md border border-transparent px-2 py-1 text-xl font-semibold text-text hover:border-border focus:border-primary-light focus:shadow-focus focus:outline-none"
            />
          ) : (
            <h2 className="text-xl font-semibold text-text">{event.title}</h2>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
        >
          <CloseIcon />
        </button>
      </header>

      {layout === "modal" ? (
        <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-6">{content}</div>
          <aside className="space-y-5">
            {details}
            {deleteSection}
          </aside>
        </div>
      ) : (
        <div className="cb-scroll min-h-0 flex-1 space-y-5 overflow-y-auto p-5">
          {details}
          {content}
          {deleteSection}
        </div>
      )}
    </div>
  );
}

/** Field heading: a <label> when there's an input to point at, plain text for read-only values. */
function Heading({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return htmlFor ? (
    <label htmlFor={htmlFor} className={HEADING}>
      {children}
    </label>
  ) : (
    <span className={HEADING}>{children}</span>
  );
}

/** Calendar date plus start/end time; the end keeps the duration if it would land before the start. */
function ScheduleFields({
  event,
  onChange,
}: {
  event: CalendarEvent;
  onChange: (id: string, patch: Partial<CalendarEvent>) => void;
}) {
  const commit = (fields: { date?: string; startTime?: string; endTime?: string }) =>
    onChange(event.id, rescheduleEvent(event, fields));

  return (
    <div className="space-y-2">
      <input
        type="date"
        aria-label="Calendar date"
        value={format(new Date(event.start), "yyyy-MM-dd")}
        onChange={(e) => e.target.value && commit({ date: e.target.value })}
        className={FIELD}
      />
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5">
        <input
          type="time"
          aria-label="Start time"
          value={format(new Date(event.start), "HH:mm")}
          onChange={(e) => e.target.value && commit({ startTime: e.target.value })}
          className={`${FIELD} min-w-0 px-2`}
        />
        <span className="text-text-light">–</span>
        <input
          type="time"
          aria-label="End time"
          value={format(new Date(event.end), "HH:mm")}
          onChange={(e) => e.target.value && commit({ endTime: e.target.value })}
          className={`${FIELD} min-w-0 px-2`}
        />
      </div>
    </div>
  );
}

function Subtasks({
  subtasks,
  onChange,
  onSelect,
}: {
  subtasks: CalendarEvent[];
  onChange: (id: string, patch: Partial<CalendarEvent>) => void;
  onSelect: (id: string) => void;
}) {
  const done = subtasks.filter((t) => t.status === "done").length;

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-light">Subtasks</span>
        <span className="text-xs font-medium text-text-muted">
          {done}/{subtasks.length}
        </span>
      </div>
      <p className="mb-2 text-xs text-text-light">
        Adjust any subtask&apos;s date or time to fit your schedule.
      </p>
      <ul className="space-y-2">
        {subtasks.map((t) => (
          <li key={t.id} className="rounded-lg border border-border-light p-3">
            <div className="mb-2 flex items-center gap-2">
              <input
                type="checkbox"
                checked={t.status === "done"}
                onChange={() => onChange(t.id, { status: t.status === "done" ? "todo" : "done" })}
                aria-label={`Mark “${t.title}” ${t.status === "done" ? "not done" : "done"}`}
                className="h-4 w-4 shrink-0 accent-primary"
              />
              <button
                onClick={() => onSelect(t.id)}
                className={`min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary ${
                  t.status === "done" ? "text-text-light line-through" : "text-text"
                }`}
              >
                {t.title}
              </button>
            </div>
            <ScheduleFields event={t} onChange={onChange} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function PriorityButton({
  active,
  activeClass = "bg-surface-muted text-text",
  onClick,
  children,
}: {
  active: boolean;
  activeClass?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
        active ? `border-transparent ${activeClass}` : "border-border text-text-muted hover:border-primary-light hover:text-text"
      }`}
    >
      {children}
    </button>
  );
}

function Checklist({
  items,
  onChange,
}: {
  items: ChecklistItem[];
  onChange: (items: ChecklistItem[]) => void;
}) {
  const [draft, setDraft] = useState("");
  const progress = checklistProgress(items);
  const percent = progress ? Math.round((progress.done / progress.total) * 100) : 0;

  const add = () => {
    const text = draft.trim();
    if (!text) return;
    onChange([...items, { id: newId("item"), text, done: false }]);
    setDraft("");
  };
  const patch = (id: string, change: Partial<ChecklistItem>) =>
    onChange(items.map((item) => (item.id === id ? { ...item, ...change } : item)));

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-text-light">Checklist</span>
        {progress && (
          <span className="text-xs font-medium text-text-muted">
            {progress.done}/{progress.total}
          </span>
        )}
      </div>

      {progress && (
        <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-muted">
          <div className="h-full rounded-full bg-success transition-all" style={{ width: `${percent}%` }} />
        </div>
      )}

      <ul className="space-y-1">
        {items.map((item) => (
          <li key={item.id} className="group flex items-center gap-2 rounded-md px-1 hover:bg-surface-muted">
            <input
              type="checkbox"
              checked={item.done}
              onChange={() => patch(item.id, { done: !item.done })}
              aria-label={`Mark “${item.text}” ${item.done ? "not done" : "done"}`}
              className="h-4 w-4 shrink-0 accent-primary"
            />
            <input
              value={item.text}
              onChange={(e) => patch(item.id, { text: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && onChange(items.filter((i) => i.id !== item.id))}
              aria-label="Checklist item"
              className={`min-w-0 flex-1 bg-transparent py-1.5 text-sm focus:outline-none ${
                item.done ? "text-text-light line-through" : "text-text"
              }`}
            />
            <button
              onClick={() => onChange(items.filter((i) => i.id !== item.id))}
              aria-label={`Remove “${item.text}”`}
              className="grid h-6 w-6 place-items-center rounded text-text-light opacity-0 transition-opacity hover:text-error focus:opacity-100 group-hover:opacity-100"
            >
              <CloseIcon className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>

      <div className="mt-2 flex items-center gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="Add an item"
          aria-label="New checklist item"
          className={FIELD}
        />
        <button
          onClick={add}
          aria-label="Add checklist item"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border text-text-muted transition-colors hover:border-primary-light hover:text-text"
        >
          <PlusIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function Labels({
  id,
  labels,
  onChange,
}: {
  id: string;
  labels: string[];
  onChange: (labels: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const label = draft.trim().replace(/,$/, "").trim();
    setDraft("");
    if (!label || labels.some((l) => l.toLowerCase() === label.toLowerCase())) return;
    onChange([...labels, label]);
  };

  return (
    <div>
      <label htmlFor={id} className={HEADING}>
        Labels
      </label>
      {labels.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <span
              key={label}
              className="inline-flex items-center gap-1 rounded-full bg-surface-muted py-0.5 pl-2.5 pr-1 text-xs font-medium text-text"
            >
              {label}
              <button
                onClick={() => onChange(labels.filter((l) => l !== label))}
                aria-label={`Remove label ${label}`}
                className="grid h-4 w-4 place-items-center rounded-full text-text-light hover:bg-border hover:text-text"
              >
                <CloseIcon className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        id={id}
        value={draft}
        maxLength={30}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder="Add a label, then press Enter"
        className={FIELD}
      />
    </div>
  );
}
