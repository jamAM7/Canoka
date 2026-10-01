import type { SkipReason } from "./types";

// Which assessments get AI subtasks. Pure, so it's tested without a database.
//
// The weight/points rule is the generator's (llm/generate_subtasks.py
// needs_subtasks): weekly journals and participation marks aren't worth a plan.
// Unlike the script it treats a missing weight or points value as "unknown",
// not as a reason to skip, so a subject whose weights Canvas doesn't give
// still gets subtasks.

/** Skipped below this weight (percent) or at/below this many points. */
export const MIN_WEIGHT = 10;
export const MAX_SKIPPED_POINTS = 2;
/** Characters of brief (or stored assessment text) below which there's nothing to plan from. */
export const MIN_TEXT_CHARS = 30;

// Canvas's own total rows ("Final Mark", "Total", "Current Score") come through
// the scrape as assignments. Matches the whole name only, so "Final Report" and
// "Final Exam" still count.
const NOT_AN_ASSESSMENT =
  /^(?:(?:final|total|current|overall|running|course)\s+)*(?:marks?|grades?|scores?|totals?|results?)$/i;

export function looksLikeAssessment(name: string): boolean {
  return !NOT_AN_ASSESSMENT.test(name.trim().replace(/\s+/g, " ").replace(/[\s:.\-]+$/, ""));
}

export interface AssessmentFacts {
  name: string;
  /** ISO timestamp, or null. */
  dueAt: string | null;
  weight: number | null;
  points: number | null;
  /** Length of the brief, or of the stored assessment text if that's longer. */
  textChars: number;
  /** Has AI subtasks already. */
  hasSubtasks: boolean;
}

export interface SkipOptions {
  now: Date;
  /** The student named this assessment: the weight/points threshold doesn't apply. */
  explicit: boolean;
  regenerate: boolean;
}

/** Why an assessment shouldn't get subtasks, or null if it should. The first reason that applies. */
export function skipReason(a: AssessmentFacts, o: SkipOptions): SkipReason | null {
  if (!looksLikeAssessment(a.name)) return "not_an_assessment";
  const due = a.dueAt ? Date.parse(a.dueAt) : NaN;
  if (Number.isNaN(due)) return "no_due_date";
  if (due <= o.now.getTime()) return "past_due";
  if (!o.explicit && belowThreshold(a)) return "below_threshold";
  if (a.textChars < MIN_TEXT_CHARS) return "no_brief";
  if (a.hasSubtasks && !o.regenerate) return "already_has_tasks";
  return null;
}

function belowThreshold(a: Pick<AssessmentFacts, "weight" | "points">): boolean {
  return (a.weight !== null && a.weight < MIN_WEIGHT) || (a.points !== null && a.points <= MAX_SKIPPED_POINTS);
}
