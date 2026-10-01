import type { NotesReview } from "@/lib/ai/review";

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

export function loadNotes(): Note[] | null {
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

export function saveNotes(notes: Note[]): void {
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
