import type { NotesReview } from "@/lib/ai/review";
import type { NoteDto, WeekReviewDto } from "./types";

// Notes (/api/notes) and their AI reviews (/api/notes/review) live in
// Supabase. These are the shapes the Notes page keeps them in.

/** A note as the Notes page holds it: what GET /api/notes returns. */
export type Note = NoteDto;

/** The last AI review of a subject's week, keyed by reviewKey(). */
export interface SavedReview {
  at: string;
  /** How many notes it covered. */
  notes: number;
  /** Whether there was course content for the week to check against. */
  hadCourseContent: boolean;
  /** Canvas couldn't be reached, so the course content already stored was used and may be out of date. */
  contentStale: boolean;
  /** Why, for a review just made. Not stored, so null for one loaded later. */
  staleReason: string | null;
  /** When the week's course content was last saved to the database. */
  contentUpdatedAt: string | null;
  review: NotesReview;
}

export const reviewKey = (courseId: string, week: number) => `${courseId}:${week}`;

export function toSavedReview(dto: WeekReviewDto, staleReason: string | null = null): SavedReview {
  return {
    at: dto.createdAt,
    notes: dto.noteCount,
    hadCourseContent: dto.hadCourseContent,
    contentStale: dto.contentStale,
    staleReason,
    contentUpdatedAt: dto.contentUpdatedAt,
    review: dto.content,
  };
}
