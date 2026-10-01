// Until Supabase is wired up, typed notes live in this browser's localStorage.
// Bump the key's version if the saved shape changes.
const KEY = "canoka.notes.v2";

export interface Note {
  id: string;
  /** Canvas course id of the note's subject (see lib/scraper/subjects). */
  courseId: string;
  title: string;
  body: string;
}

export function loadNotes(): Note[] | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : null;
  } catch {
    return null;
  }
}

export function saveNotes(notes: Note[]): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Storage blocked or full: keep working in memory for this session.
  }
}
