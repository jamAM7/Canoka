import type { NotesReview } from "@/lib/ai/review";
import type { NoteDto } from "./types";

// Notes live in Supabase (see /api/notes). What's still kept in this browser's
// localStorage is each week's last AI review, until reviews are stored in the
// database too. Bump a key's version if its saved shape changes.
const REVIEWS_KEY = "canoka.reviews.v1";

/** A note as the Notes page holds it: what GET /api/notes returns. */
export type Note = NoteDto;

/** The last AI review of a subject's week, keyed by reviewKey(). */
export interface SavedReview {
  at: string;
  /** How many notes it covered. */
  notes: number;
  /** Whether the last scrape had course content for the week to check against. */
  hadCourseContent: boolean;
  review: NotesReview;
}

export const reviewKey = (courseId: string, week: number) => `${courseId}:${week}`;

export function loadReviews(): Record<string, SavedReview> {
  try {
    const data = JSON.parse(window.localStorage.getItem(REVIEWS_KEY) ?? "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export function saveReviews(reviews: Record<string, SavedReview>): void {
  try {
    window.localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  } catch {
    // Storage blocked or full: the review still shows until the page reloads.
  }
}

/** The note's words without formatting, from HTML. The review route still takes notes this way. */
export function noteText(html: string): string {
  return html
    .replace(/<\/(p|h[1-6]|li|tr|blockquote|pre)>|<br\s*\/?>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}
