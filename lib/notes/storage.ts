import type { NotesReview } from "@/lib/ai/review";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Until Supabase is wired up, typed notes and their AI reviews live in this
// browser's localStorage. Bump a key's version if its saved shape changes.
const KEY = "canoka.notes.v3";
/** Notes from before formatting, plain text in `body`. Read once to carry them over. */
const PLAIN_TEXT_KEY = "canoka.notes.v2";
const REVIEWS_KEY = "canoka.reviews.v1";

export interface Note {
  id: string;
  /** Canvas course id of the note's subject (see lib/scraper/subjects). */
  courseId: string;
  /** The teaching week it's for. Null for notes from before weeks, until one is chosen. */
  week: number | null;
  title: string;
  /** The note's formatted text, as HTML from the editor. */
  content: string;
}

/** The last AI review of a subject's week, keyed by reviewKey(). */
export interface SavedReview {
  at: string;
  /** How many notes it covered. */
  notes: number;
  /** Whether the last scrape had course content for the week to check against. */
  hadCourseContent: boolean;
  review: NotesReview;
}

export async function loadNotes(): Promise<Note[] | null> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data, error } = await supabase
          .from("notes")
          .select("id, course_id, week, title, content")
          .eq("user_id", auth.user.id)
          .order("updated_at", { ascending: false });
        if (error) throw error;
        if (data.length > 0) return data.map((note) => ({
          id: note.id,
          courseId: note.course_id,
          week: note.week,
          title: note.title,
          content: note.content,
        }));
        const legacy = loadNotesLocal();
        if (legacy?.length) {
          await saveNotes(legacy);
          return legacy;
        }
        return [];
      }
    } catch {
      // Keep the app usable offline; the next successful save syncs the current copy.
    }
  }
  return loadNotesLocal();
}

function loadNotesLocal(): Note[] | null {
  try {
    const saved = readList(KEY);
    if (saved) return saved.map((note) => ({ ...note, week: typeof note.week === "number" ? note.week : null }));
    const plain = readList(PLAIN_TEXT_KEY);
    return (
      plain &&
      plain.map(({ body, ...note }) => ({ ...note, week: null, content: textToHtml(String(body ?? "")) }))
    );
  } catch {
    return null;
  }
}

export const reviewKey = (courseId: string, week: number) => `${courseId}:${week}`;

export async function loadReviews(): Promise<Record<string, SavedReview>> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data, error } = await supabase
          .from("note_reviews")
          .select("review_key, reviewed_at, note_count, had_course_content, review")
          .eq("user_id", auth.user.id);
        if (error) throw error;
        if (data.length === 0) {
          const legacy = loadReviewsLocal();
          if (Object.keys(legacy).length) {
            await saveReviews(legacy);
            return legacy;
          }
        }
        return Object.fromEntries(data.map((row) => [row.review_key, {
          at: row.reviewed_at,
          notes: row.note_count,
          hadCourseContent: row.had_course_content,
          review: row.review as NotesReview,
        }]));
      }
    } catch {
      // Fall back to the existing browser copy while offline.
    }
  }
  return loadReviewsLocal();
}

function loadReviewsLocal(): Record<string, SavedReview> {
  try {
    const data = JSON.parse(window.localStorage.getItem(REVIEWS_KEY) ?? "{}");
    return data && typeof data === "object" && !Array.isArray(data) ? data : {};
  } catch {
    return {};
  }
}

export async function saveReviews(reviews: Record<string, SavedReview>): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase.from("note_reviews").delete().eq("user_id", auth.user.id);
        const rows = Object.entries(reviews).map(([key, value]) => ({
          user_id: auth.user!.id,
          review_key: key,
          reviewed_at: value.at,
          note_count: value.notes,
          had_course_content: value.hadCourseContent,
          review: value.review,
        }));
        if (rows.length) {
          const { error } = await supabase.from("note_reviews").insert(rows);
          if (error) throw error;
        }
        return;
      }
    } catch {
      // Preserve a local copy if the network is unavailable.
    }
  }
  try {
    window.localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
  } catch {
    // Storage blocked or full: the review still shows until the page reloads.
  }
}

export async function saveNotes(notes: Note[]): Promise<void> {
  if (isSupabaseConfigured()) {
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        await supabase.from("notes").delete().eq("user_id", auth.user.id);
        if (notes.length) {
          const { error } = await supabase.from("notes").insert(notes.map((note) => ({
            id: note.id,
            user_id: auth.user!.id,
            course_id: note.courseId,
            week: note.week,
            title: note.title,
            content: note.content,
            updated_at: new Date().toISOString(),
          })));
          if (error) throw error;
        }
        return;
      }
    } catch {
      // Preserve a local copy if the network is unavailable.
    }
  }
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Storage blocked or full: keep working in memory for this session.
  }
}

/** The note's words without formatting: a line per paragraph, heading, list item or table row. */
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

function readList(key: string) {
  const raw = window.localStorage.getItem(key);
  if (!raw) return null;
  const data = JSON.parse(raw);
  return Array.isArray(data) ? data : null;
}

/** Plain text as HTML paragraphs, one per line. */
function textToHtml(text: string): string {
  const escape = (line: string) => line.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .split("\n")
    .map((line) => `<p>${escape(line)}</p>`)
    .join("");
}
