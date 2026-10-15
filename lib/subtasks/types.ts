// What POST /api/subtasks/generate returns, and why it skips what it skips.
// No server imports, so the Calendar button can use it.

export type SkipReason =
  | "not_an_assessment"
  | "no_due_date"
  | "past_due"
  | "below_threshold"
  | "no_brief"
  | "already_has_tasks"
  | "too_soon";

/** Each reason as it reads in "Skipped 20: past due". */
export const SKIP_LABELS: Record<SkipReason, string> = {
  not_an_assessment: "not an assessment",
  no_due_date: "no due date",
  past_due: "past due",
  below_threshold: "under the weight/points threshold",
  no_brief: "no brief",
  already_has_tasks: "already has subtasks",
  too_soon: "due too soon to schedule",
};

export interface CreatedItem {
  /** assignments.id, which is also the assessment's id on the calendar. */
  assignmentId: string;
  name: string;
  /** Subtasks saved. */
  count: number;
  /** The days before the deadline couldn't hold full-length sessions, so some were shortened or left out. */
  tight: boolean;
  /** Subtasks Claude suggested that didn't fit before the deadline. */
  dropped: number;
  /** Old AI subtasks removed (regenerate only). */
  replaced: number;
  /** Something the student should know, e.g. the old subtasks couldn't be removed. */
  warning?: string;
}

export interface SkippedItem {
  assignmentId: string;
  name: string;
  reason: SkipReason;
}

export interface FailedItem {
  assignmentId: string;
  name: string;
  /** Fit to show the student. */
  error: string;
}

export interface GenerateResult {
  created: CreatedItem[];
  skipped: SkippedItem[];
  failed: FailedItem[];
  /** Assessments that qualified but are past this request's cap. Press the button again. */
  remaining: number;
}
