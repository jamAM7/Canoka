import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// The subjects the Canvas scraper (scraper/scrape.py) found, read from the
// index it writes to scraper/out/index.json. Server-only, since it reads from
// disk: run the scraper on the machine serving the app. Swap for a query
// against `subjects` once /api/canvas/sync stores them in Supabase.

export interface Subject {
  /** Canvas course id. Notes are saved against it, as it's unique per offering. */
  id: string;
  /** UTS subject code, e.g. "41052". Null for courses without one. */
  code: string | null;
  /** Name without the code, e.g. "Advanced Algorithms". */
  name: string;
}

export interface LastScrape {
  /** When the index was written. */
  at: string;
  /** The session the scraper picked, e.g. "Spring 2026", if it picked one. */
  session: string | null;
  subjects: Subject[];
}

const INDEX = path.join(process.cwd(), "scraper", "out", "index.json");

/** Subjects from the last scrape, by code, or none if the scraper hasn't run here. */
export async function loadSubjects(): Promise<Subject[]> {
  return (await lastScrape())?.subjects ?? [];
}

export async function lastScrape(): Promise<LastScrape | null> {
  let raw: string;
  let at: Date;
  try {
    raw = await readFile(INDEX, "utf8");
    at = (await stat(INDEX)).mtime;
  } catch {
    return null;
  }

  try {
    const { subjects, session_selection } = JSON.parse(raw);
    if (!Array.isArray(subjects)) throw new Error("it has no `subjects` list");
    return {
      at: at.toISOString(),
      session: session_selection?.name ?? null,
      subjects: subjects
        .filter((s) => s && s.course_id != null && typeof s.name === "string")
        .map((s) => ({ id: String(s.course_id), code: s.code ?? null, name: s.name }))
        .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name)),
    };
  } catch (error) {
    console.error(`Ignoring ${INDEX}:`, error);
    return null;
  }
}
