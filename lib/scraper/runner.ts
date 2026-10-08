import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Readable } from "node:stream";
import {
  commandLine,
  scrapeArgs,
  type ScrapeLine,
  type ScrapeOptions,
  type ScrapeProgress,
  type ScrapeRun,
  type ScraperSetup,
} from "./cli";
import { readCanvasEnv } from "./env";

// Runs scraper/scrape.py on this machine for the Settings page, one scrape at
// a time, and keeps its output so the page can follow along. Server-only.

export const SCRAPER_DIR = path.join(process.cwd(), "scraper");
// The virtualenv scripts/setup-python.mjs creates at the repo root.
export const PYTHON =
  process.platform === "win32"
    ? path.join(process.cwd(), ".venv", "Scripts", "python.exe")
    : path.join(process.cwd(), ".venv", "bin", "python");
/** Output kept per scrape. Older lines are dropped first. */
const MAX_LINES = 2000;

interface Run extends ScrapeRun {
  lines: ScrapeLine[];
  /** How many lines were dropped from the start to stay under MAX_LINES. */
  dropped: number;
  child: ChildProcess;
  stopping: boolean;
}

// On globalThis so a running scrape survives dev hot reloads, which re-run this module.
const store = globalThis as typeof globalThis & { canokaScrape?: Run };

export class ScrapeBusyError extends Error {}

export function startScrape(options: ScrapeOptions): void {
  const previous = store.canokaScrape;
  if (previous?.status === "running") throw new ScrapeBusyError("A scrape is already running.");
  if (!existsSync(PYTHON)) {
    throw new Error(
      `No Python at ${path.relative(process.cwd(), PYTHON)}. Run npm run setup:python to create it.`,
    );
  }

  const child = spawn(PYTHON, ["scrape.py", ...scrapeArgs(options)], {
    cwd: SCRAPER_DIR,
    // Unbuffered, so output arrives as it's printed rather than when the pipe fills.
    env: { ...process.env, PYTHONUNBUFFERED: "1", PYTHONIOENCODING: "utf-8" },
  });
  const run: Run = {
    id: (previous?.id ?? 0) + 1,
    command: commandLine(options),
    status: "running",
    exitCode: null,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    lines: [],
    dropped: 0,
    child,
    stopping: false,
  };
  store.canokaScrape = run;

  onLines(child.stdout, (text) => append(run, text, false));
  onLines(child.stderr, (text) => append(run, text, true));
  child.on("error", (error) => {
    append(run, `Could not run the scraper: ${error.message}`, true);
    finish(run, null);
  });
  // Output can trail the exit, so a run ends on "close", after the last of it.
  // Should something keep the pipes open past the exit, it ends soon after anyway.
  child.on("exit", (code) => setTimeout(() => finish(run, code), 2000));
  child.on("close", (code) => finish(run, code));
}

/** Ends the running scrape's process. False if none is running. */
export function stopScrape(): boolean {
  const run = store.canokaScrape;
  if (run?.status !== "running") return false;
  run.stopping = true;
  run.child.kill();
  return true;
}

/** The current or last scrape, with its output from line `since` if `runId` is still the one running. */
export function scrapeProgress(runId?: number, since = 0): ScrapeProgress {
  const run = store.canokaScrape;
  if (!run) return { run: null, lines: [], next: 0 };
  const from = run.id === runId ? Math.max(0, since - run.dropped) : 0;
  return {
    run: {
      id: run.id,
      command: run.command,
      status: run.status,
      exitCode: run.exitCode,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
    },
    lines: run.lines.slice(from),
    next: run.dropped + run.lines.length,
  };
}

/** What the scraper needs on this machine, read the way scrape.py reads it. */
export function scraperSetup(): ScraperSetup {
  const file = readCanvasEnv();
  // As in scrape.py, the process environment wins over scraper/.env.
  return {
    enabled: process.env.NODE_ENV !== "production",
    python: existsSync(PYTHON),
    canvasUrl: process.env.CANVAS_BASE_URL || file.CANVAS_BASE_URL || null,
    token: Boolean(process.env.CANVAS_TOKEN || file.CANVAS_TOKEN),
  };
}

function append(run: Run, text: string, stderr: boolean) {
  run.lines.push({ text, stderr });
  if (run.lines.length > MAX_LINES) {
    run.lines.shift();
    run.dropped += 1;
  }
}

function finish(run: Run, code: number | null) {
  if (run.status !== "running") return;
  run.exitCode = code;
  run.status = run.stopping ? "stopped" : code === 0 ? "succeeded" : "failed";
  run.finishedAt = new Date().toISOString();
}

/** One callback per line. Of a line rewritten with \r, keeps what a terminal would show. */
function onLines(stream: Readable, callback: (line: string) => void) {
  const shown = (line: string) => line.replace(/\r$/, "").split("\r").pop() ?? "";
  let partial = "";
  stream.setEncoding("utf8");
  stream.on("data", (chunk: string) => {
    const lines = (partial + chunk).split("\n");
    partial = lines.pop() ?? "";
    for (const line of lines) callback(shown(line));
  });
  stream.on("end", () => {
    if (partial) callback(shown(partial));
  });
}
