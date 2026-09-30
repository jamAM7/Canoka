// Until Supabase is wired up, typed notes live in this browser's localStorage,
// keyed by course id. Bump the key's version if the saved shape changes.
const KEY = "canoka.notes.v1";

export interface Note {
  title: string;
  body: string;
}

export type SavedNotes = Record<string, Note>;

export function loadNotes(): SavedNotes | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    return data && typeof data === "object" ? data : null;
  } catch {
    return null;
  }
}

export function saveNotes(notes: SavedNotes): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(notes));
  } catch {
    // Storage blocked or full: keep working in memory for this session.
  }
}
