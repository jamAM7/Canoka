import { readFile } from "node:fs/promises";
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

const INDEX = path.join(process.cwd(), "scraper", "out", "index.json");

/** Subjects from the last scrape, by code, or none if the scraper hasn't run here. */
export async function loadSubjects(): Promise<Subject[]> {
  let raw: string;
  try {
    raw = await readFile(INDEX, "utf8");
  } catch {
    return [];
  }

  try {
    const { subjects } = JSON.parse(raw);
    if (!Array.isArray(subjects)) throw new Error("it has no `subjects` list");
    return subjects
      .filter((s) => s && s.course_id != null && typeof s.name === "string")
      .map((s) => ({ id: String(s.course_id), code: s.code ?? null, name: s.name }))
      .sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));
  } catch (error) {
    console.error(`Ignoring ${INDEX}:`, error);
    return [];
  }
}
