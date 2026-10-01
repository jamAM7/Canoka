import { readFile, stat } from "node:fs/promises";
import path from "node:path";

// The subjects the Canvas scraper (scraper/scrape.py) found, read from the
// index it writes to scraper/out/index.json. Server-only, since it reads from
// disk: run the scraper on the machine serving the app. Swap for a query
// against `subjects` once /api/canvas/sync stores them in Supabase.

export interface Week {
  number: number;
  /** From the module named for the week, e.g. "Systems Thinking in Practice". */
  title: string | null;
}

export interface Subject {
  /** Canvas course id. Notes are saved against it, as it's unique per offering. */
  id: string;
  /** UTS subject code, e.g. "41052". Null for courses without one. */
  code: string | null;
  /** Name without the code, e.g. "Advanced Algorithms". */
  name: string;
  /** Week 1 to the last week the subject names: a whole session, even where Canvas names none. */
  weeks: Week[];
}

export interface LastScrape {
  /** When the index was written. */
  at: string;
  /** The session the scraper picked, e.g. "Spring 2026", if it picked one. */
  session: string | null;
  subjects: Subject[];
}

const OUT = path.join(process.cwd(), "scraper", "out");
const INDEX = path.join(OUT, "index.json");
/** Teaching weeks in a UTS session. */
const SESSION_WEEKS = 12;
/** Past this, a "week" in a name is something else, like week 52 of a year. */
const LAST_POSSIBLE_WEEK = 20;
// The same pattern as week_label in scraper/canvas/render.py.
const WEEK = /\bweek\s*(\d{1,2})\b/i;

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
    const listed = subjects.filter((s) => s && s.course_id != null && typeof s.name === "string");
    return {
      at: at.toISOString(),
      session: session_selection?.name ?? null,
      subjects: (
        await Promise.all(
          listed.map(async (s) => ({
            id: String(s.course_id),
            code: s.code ?? null,
            name: s.name,
            weeks: await readWeeks(s.file),
          })),
        )
      ).sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name)),
    };
  } catch (error) {
    console.error(`Ignoring ${INDEX}:`, error);
    return null;
  }
}

/** The subject's weeks, from the modules, module items and assessments its document names. */
async function readWeeks(file: unknown): Promise<Week[]> {
  let document: { modules?: Named[]; assessments?: Named[] } = {};
  try {
    document = JSON.parse(await readFile(path.join(OUT, String(file)), "utf8"));
  } catch {
    // No document beside the index: the session's weeks, untitled.
  }

  const titles = new Map<number, string | null>();
  let last = SESSION_WEEKS;
  for (const module of document.modules ?? []) {
    const week = weekOf(module.name);
    if (week) {
      last = Math.max(last, week);
      if (!titles.get(week)) titles.set(week, titleOf(module.name ?? ""));
    }
    for (const item of module.items ?? []) last = Math.max(last, weekOf(item.title) ?? 0);
  }
  for (const assessment of document.assessments ?? []) last = Math.max(last, weekOf(assessment.name) ?? 0);

  return Array.from({ length: last }, (_, i) => ({ number: i + 1, title: titles.get(i + 1) ?? null }));
}

interface Named {
  name?: string;
  title?: string;
  items?: Named[];
}

function weekOf(text: string | undefined): number | null {
  const week = Number(WEEK.exec(text ?? "")?.[1]);
  return week >= 1 && week <= LAST_POSSIBLE_WEEK ? week : null;
}

/** "Week 3:  Systems Thinking in Practice" -> "Systems Thinking in Practice"; "Week 1" -> null. */
function titleOf(name: string): string | null {
  return name.replace(/^.*?\bweek\s*\d{1,2}\b[\s:|\-–—]*/i, "").trim() || null;
}
