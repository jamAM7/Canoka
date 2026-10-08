import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { PYTHON, SCRAPER_DIR } from "./runner";

const run = promisify(execFile);

/**
 * One week of a subject's Canvas content as markdown, from the last scrape, or
 * null if nothing in it names that week. Runs scraper/week.py, so the page
 * bodies, assessments and marking criteria render exactly as the scraper's own
 * views do. Server-only.
 */
export async function loadWeekContent(subjectId: string, week: number): Promise<string | null> {
  if (!existsSync(PYTHON)) {
    throw new Error("There's no Python virtualenv at .venv. Run npm run setup:python to create it.");
  }
  try {
    const { stdout } = await run(PYTHON, ["week.py", subjectId, String(week), "--json"], {
      cwd: SCRAPER_DIR,
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
      timeout: 30_000,
      maxBuffer: 20 * 1024 * 1024,
    });
    return JSON.parse(stdout).markdown ?? null;
  } catch (error) {
    // week.py says what went wrong on stderr, e.g. a subject missing from the last scrape.
    const stderr = (error as { stderr?: string }).stderr?.trim();
    throw new Error(stderr || (error instanceof Error ? error.message : String(error)));
  }
}
