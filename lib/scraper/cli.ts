// The scraper's command line (scraper/scrape.py) as the Settings page offers
// it: options in, the exact arguments out. Shared by the page, which previews
// the command, and /api/scraper, which runs it, so it imports nothing from Node.

export interface ScrapeOptions {
  /** current: the session running today (the CLI default). named: --session. all: --all-sessions. */
  sessionMode: "current" | "named" | "all";
  sessionName: string;
  /** --courses: only these subject codes or course IDs. Empty for every subject. */
  courses: string[];
  includeConcluded: boolean;
  includeNonSubjects: boolean;
  download: boolean;
  /** --extract, which implies --download. */
  extract: boolean;
  /** --ocr, which only applies while extracting. */
  ocr: boolean;
  noRender: boolean;
  dropBoilerplate: boolean;
  pretty: boolean;
  refresh: boolean;
  quiet: boolean;
  timezone: string;
}

export const DEFAULT_TIMEZONE = "Australia/Sydney";

export const DEFAULT_OPTIONS: ScrapeOptions = {
  sessionMode: "current",
  sessionName: "",
  courses: [],
  includeConcluded: false,
  includeNonSubjects: false,
  download: false,
  extract: false,
  ocr: false,
  noRender: false,
  dropBoilerplate: false,
  pretty: false,
  refresh: false,
  quiet: false,
  timezone: DEFAULT_TIMEZONE,
};

/** The arguments after `scrape.py`. Values use --flag=value so none can pass for a flag. */
export function scrapeArgs(o: ScrapeOptions): string[] {
  const args: string[] = [];
  if (o.sessionMode === "named") args.push(`--session=${o.sessionName.trim()}`);
  if (o.sessionMode === "all") args.push("--all-sessions");
  if (o.includeConcluded) args.push("--include-concluded");
  if (o.includeNonSubjects) args.push("--include-non-subjects");
  if (o.courses.length > 0) args.push("--courses", ...o.courses);
  if (o.extract) args.push("--extract");
  else if (o.download) args.push("--download");
  if (o.extract && o.ocr) args.push("--ocr");
  if (o.noRender) args.push("--no-render");
  if (o.dropBoilerplate) args.push("--drop-boilerplate");
  if (o.pretty) args.push("--pretty");
  if (o.refresh) args.push("--refresh");
  if (o.quiet) args.push("--quiet");
  if (o.timezone !== DEFAULT_TIMEZONE) args.push(`--timezone=${o.timezone}`);
  return args;
}

/** The command as you'd type it in a terminal, from scraper/. */
export function commandLine(o: ScrapeOptions): string {
  return ["python", "scrape.py", ...scrapeArgs(o)].map(quote).join(" ");
}

function quote(arg: string): string {
  if (/^[\w@%+=:,./-]*$/.test(arg)) return arg;
  const eq = arg.startsWith("--") ? arg.indexOf("=") + 1 : 0;
  return `${arg.slice(0, eq)}'${arg.slice(eq).replace(/'/g, `'\\''`)}'`;
}

const SESSION = /^[\w ().,'&-]{1,80}$/;
const COURSE = /^\d{1,12}$/;
const TIMEZONE = /^[A-Za-z][\w+\-/]{0,63}$/;

/** Checks options from the page before they become arguments. Throws a message to show. */
export function parseScrapeOptions(input: unknown): ScrapeOptions {
  const raw = (input ?? {}) as Record<string, unknown>;
  const on = (key: keyof ScrapeOptions) => raw[key] === true;

  const sessionMode = raw.sessionMode;
  if (sessionMode !== "current" && sessionMode !== "named" && sessionMode !== "all") {
    throw new Error("Choose which session to scrape.");
  }
  const sessionName = typeof raw.sessionName === "string" ? raw.sessionName.trim() : "";
  if (sessionMode === "named" && !SESSION.test(sessionName)) {
    throw new Error("Enter the session's name, e.g. Spring 2026.");
  }

  const courses = Array.isArray(raw.courses) ? raw.courses : [];
  if (courses.length > 50 || !courses.every((c) => typeof c === "string" && COURSE.test(c))) {
    throw new Error("List subjects by code or course ID, e.g. 41052 41201.");
  }

  const timezone = typeof raw.timezone === "string" ? raw.timezone.trim() : DEFAULT_TIMEZONE;
  if (!TIMEZONE.test(timezone)) throw new Error("Enter a timezone like Australia/Sydney.");

  return {
    sessionMode,
    sessionName,
    courses: courses as string[],
    includeConcluded: on("includeConcluded"),
    includeNonSubjects: on("includeNonSubjects"),
    download: on("download"),
    extract: on("extract"),
    ocr: on("ocr"),
    noRender: on("noRender"),
    dropBoilerplate: on("dropBoilerplate"),
    pretty: on("pretty"),
    refresh: on("refresh"),
    quiet: on("quiet"),
    timezone,
  };
}

// What the page sees of a scrape: /api/scraper and the runner speak these.

export type ScrapeStatus = "running" | "succeeded" | "failed" | "stopped";

export interface ScrapeRun {
  id: number;
  command: string;
  status: ScrapeStatus;
  exitCode: number | null;
  startedAt: string;
  finishedAt: string | null;
}

export interface ScrapeLine {
  text: string;
  /** Printed to stderr: the scraper's errors and warnings. */
  stderr: boolean;
}

export interface ScrapeProgress {
  /** The running scrape, or the last one since the server started. */
  run: ScrapeRun | null;
  lines: ScrapeLine[];
  /** Ask with since=next to get only the lines after these. */
  next: number;
}

/** Whether this machine can run the scraper. Never includes the token itself. */
export interface ScraperSetup {
  /** Off in production: scraping runs a process on the server. */
  enabled: boolean;
  python: boolean;
  /** CANVAS_BASE_URL, e.g. https://canvas.uts.edu.au. */
  canvasUrl: string | null;
  token: boolean;
}
