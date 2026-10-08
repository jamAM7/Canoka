import "server-only";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { PYTHON, SCRAPER_DIR, scrapeProgress } from "@/lib/scraper/runner";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { ContentType } from "@/lib/supabase/types";
import { dbError } from "./db-error";

// Gets one week of a subject from Canvas and saves it as course_content, so
// the AI review can read the week's content from the database.
//
//   scrapeWeek      runs scraper/scrape.py for the one subject, then
//                   scraper/week_rows.py week, which turns that week into rows
//   saveWeekContent upserts the rows on (course_id, content_type,
//                   external_content_id), so doing it twice changes nothing
//
// The scrape goes to its own folder, scraper/out/.review/<course id>, because
// scrape.py rewrites out/index.json with only the subjects it scraped: running
// it into out/ would drop every other subject from Settings and the scraper's
// other tools. It shares scraper/.cache, so what Canvas returned recently
// (pages and modules are cached for a week, assignments for an hour) isn't
// fetched again unless `refresh` is set.

const run = promisify(execFile);
const SCRAPE_TIMEOUT_MS = 240_000;
const COURSE_ID = /^\d{1,12}$/;
/** Rows per request. Page bodies are long. */
const CHUNK = 25;

/** One course_content row's fields from week_rows.py, before it's given a course and module. */
export interface WeekItem {
  content_type: ContentType;
  external_content_id: string;
  title: string;
  body_text: string;
  source_url: string | null;
  position: number;
  published: boolean;
  content_updated_at: string | null;
}

/** Scrapes one subject from Canvas, then returns what it holds for `week`. Throws a message to show. */
export async function scrapeWeek(externalCourseId: string, week: number, refresh: boolean): Promise<WeekItem[]> {
  if (!COURSE_ID.test(externalCourseId)) throw new Error("This subject's Canvas id isn't one the scraper accepts.");
  if (!existsSync(PYTHON)) throw new Error("There's no Python virtualenv at .venv. Set it up as the README describes.");
  // Two scrapes at once would write the same cache.
  if (scrapeProgress().run?.status === "running") throw new Error("A Canvas scrape started from Settings is still running.");

  const out = path.join(SCRAPER_DIR, "out", ".review", externalCourseId);
  const options = { cwd: SCRAPER_DIR, env: childEnv(), maxBuffer: 50 * 1024 * 1024 };

  try {
    await run(
      PYTHON,
      [
        "scrape.py",
        `--out=${out}`,
        // A finished session's subjects aren't listed otherwise. With --courses, scrape.py skips its session filter.
        "--include-concluded",
        "--no-render",
        "--quiet",
        ...(refresh ? ["--refresh"] : []),
        "--courses",
        externalCourseId,
      ],
      { ...options, timeout: SCRAPE_TIMEOUT_MS },
    );
  } catch (error) {
    throw new Error(`Canvas scrape failed: ${pythonError(error)}`);
  }

  try {
    const { stdout } = await run(PYTHON, ["week_rows.py", `--out=${out}`, "week", externalCourseId, String(week)], {
      ...options,
      timeout: 30_000,
    });
    return JSON.parse(stdout).items as WeekItem[];
  } catch (error) {
    throw new Error(`Couldn't read the week from the scrape: ${pythonError(error)}`);
  }
}

/** Upserts a week's items under one module. Nothing already stored is deleted. */
export async function saveWeekContent(courseId: string, moduleId: string, items: WeekItem[]): Promise<void> {
  const rows = items.map((item) => ({ ...item, course_id: courseId, module_id: moduleId }));
  const db = supabaseAdmin();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("course_content")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "course_id,content_type,external_content_id" });
    if (error) throw dbError("Couldn't save the week's content", error);
  }
}

/**
 * What the Python children get: this server's environment less empty values
 * (scrape.py treats `CANVAS_BASE_URL=` from an .env file as set, and then never
 * reads scraper/.env) and less the keys they have no use for.
 */
function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PYTHONIOENCODING: "utf-8" };
  for (const key of Object.keys(env)) if (env[key] === "") delete env[key];
  delete env.SUPABASE_SERVICE_ROLE_KEY;
  delete env.ANTHROPIC_API_KEY;
  return env;
}

/** The script's own message, from stderr, else what Node says. */
function pythonError(error: unknown): string {
  const e = error as { stderr?: string; killed?: boolean; message?: string };
  if (e.killed) return `it took longer than ${SCRAPE_TIMEOUT_MS / 1000} seconds.`;
  const lines = (e.stderr ?? "").trim().split(/\r?\n/).filter(Boolean);
  return (lines.length > 0 ? lines.slice(-3).join(" ") : (e.message ?? String(error))).slice(0, 400);
}
