// Shared types for the calendar feature.
//
// The calendar surfaces three kinds of objects (see README):
//   - class        : a recurring or one-off timetabled session (fixed start/end)
//   - assessment   : a Canvas assessment task with a due date; can hold subtasks
//   - task         : a self-created or AI-generated study task
//
// Assessments auto-break into subtasks; a subtask is just a `task` whose
// `parentId` points at the assessment it belongs to.

export type CalendarEventType = "class" | "assessment" | "task";

export type TaskStatus = "coming_up" | "todo" | "in_progress" | "done";

export type TaskPriority = "low" | "medium" | "high";

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface Course {
  id: string;
  /** Short code shown on event chips, e.g. "31251". */
  code: string;
  name: string;
  /** Tailwind-friendly hue used to colour every event for this course. */
  color: CourseColor;
}

export type CourseColor =
  | "blue"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan";

export interface CalendarEvent {
  id: string;
  title: string;
  type: CalendarEventType;
  /** ISO 8601. For assessments/tasks this is when the work is scheduled. */
  start: string;
  /** ISO 8601. */
  end: string;
  courseId?: string;
  location?: string;
  notes?: string;
  /** Present for `assessment` and `task`. Drives the Kanban board. */
  status?: TaskStatus;
  /** When set, this event is a subtask of the given assessment. */
  parentId?: string;
  /** Hard deadline for assessments/tasks (may differ from `start`/`end`). */
  dueDate?: string;
  /** Kanban card details the student adds to assessments and tasks. */
  priority?: TaskPriority;
  labels?: string[];
  checklist?: ChecklistItem[];
}

export type CalendarViewMode = "week" | "month" | "kanban";

/**
 * A Kanban column. Students can add and rename columns, but each one counts as
 * a TaskStatus, so the week/month views and dashboard keep reading `status`.
 */
export interface KanbanColumn {
  id: string;
  title: string;
  status: TaskStatus;
}

export interface KanbanBoard {
  columns: KanbanColumn[];
  /** Card ids per column id, in board order. */
  order: Record<string, string[]>;
}
