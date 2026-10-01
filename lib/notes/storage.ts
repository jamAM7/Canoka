// Until Supabase is wired up, typed notes live in this browser's localStorage.
// Bump the key's version if the saved shape changes.
const KEY = "canoka.notes.v3";
/** Notes from before formatting, plain text in `body`. Read once to carry them over. */
const PLAIN_TEXT_KEY = "canoka.notes.v2";

export interface Note {
  id: string;
  /** Canvas course id of the note's subject (see lib/scraper/subjects). */
  courseId: string;
  title: string;
  /** The note's formatted text, as HTML from the editor. */
  content: string;
}

export function loadNotes(): Note[] | null {
  try {
    const saved = readList(KEY);
    if (saved) return saved;
    const plain = readList(PLAIN_TEXT_KEY);
    return plain && plain.map(({ body, ...note }) => ({ ...note, content: textToHtml(String(body ?? "")) }));
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
