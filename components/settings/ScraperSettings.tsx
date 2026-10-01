"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  DEFAULT_OPTIONS,
  commandLine,
  parseScrapeOptions,
  type ScrapeLine,
  type ScrapeOptions,
  type ScrapeProgress,
  type ScrapeRun,
  type ScraperSetup,
} from "@/lib/scraper/cli";
import type { LastScrape } from "@/lib/scraper/subjects";

interface Props {
  setup: ScraperSetup;
  lastScrape: LastScrape | null;
  /** The running or last scrape when the page loaded. */
  progress: ScrapeProgress;
}

const HEADING = "mb-2 block text-xs font-semibold uppercase tracking-wide text-text-light";
const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";
const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted";
/** Output kept on the page, as on the server. */
const MAX_LINES = 2000;

// Settings › Canvas scraper: run scraper/scrape.py with any of its options,
// follow its output, and see what the last scrape found. Notes lists the
// subjects from that last scrape.
export function ScraperSettings({ setup, lastScrape, progress }: Props) {
  const router = useRouter();
  const [options, setOptions] = useState<ScrapeOptions>(DEFAULT_OPTIONS);
  const [coursesText, setCoursesText] = useState("");
  const [run, setRun] = useState(progress.run);
  const [lines, setLines] = useState<ScrapeLine[]>(progress.lines);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  // Null until mounted, so the server and browser render the same elapsed time.
  const [now, setNow] = useState<number | null>(null);
  const next = useRef(progress.next);
  const log = useRef<HTMLPreElement>(null);
  const stickToBottom = useRef(true);

  const chosen: ScrapeOptions = { ...options, courses: coursesText.split(/[\s,]+/).filter(Boolean) };
  const set = <K extends keyof ScrapeOptions>(key: K, value: ScrapeOptions[K]) =>
    setOptions((o) => ({ ...o, [key]: value }));
  const running = run?.status === "running";

  const blockers = [
    !setup.enabled && "Scraping from the app only works in development (npm run dev).",
    !setup.python && "There's no Python virtualenv at .venv. Set it up as the README describes.",
    (!setup.canvasUrl || !setup.token) && "Save your Canvas URL and API token above first.",
  ].filter((b): b is string => Boolean(b));

  const [canvasUrl, setCanvasUrl] = useState(setup.canvasUrl ?? "");
  // Never filled from the server: the saved token stays there.
  const [token, setToken] = useState("");
  const [savingCanvas, setSavingCanvas] = useState(false);
  const [canvasMessage, setCanvasMessage] = useState<{ text: string; error: boolean } | null>(null);
  const canvasChanged = canvasUrl.trim() !== (setup.canvasUrl ?? "") || token.trim() !== "";

  const saveCanvas = async (e: FormEvent) => {
    e.preventDefault();
    setCanvasMessage(null);
    setSavingCanvas(true);
    try {
      const res = await fetch("/api/scraper/canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: canvasUrl, token }),
      });
      const data = await res.json();
      if (!res.ok) {
        setCanvasMessage({ text: data.error, error: true });
        return;
      }
      setCanvasUrl(data.canvasUrl);
      setToken("");
      setCanvasMessage({ text: "Saved.", error: false });
      router.refresh();
    } catch {
      setCanvasMessage({ text: "Couldn't reach the app's server.", error: true });
    } finally {
      setSavingCanvas(false);
    }
  };

  const show = (data: ScrapeProgress, append: boolean) => {
    setRun(data.run);
    setLines((prev) => (append ? [...prev, ...data.lines] : data.lines).slice(-MAX_LINES));
    next.current = data.next;
  };

  // Follow a running scrape's output, then reload the page's data when it ends.
  useEffect(() => {
    if (!run || run.status !== "running") return;
    const id = run.id;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const poll = async () => {
      try {
        const res = await fetch(`/api/scraper?run=${id}&since=${next.current}`, { cache: "no-store" });
        const data: ScrapeProgress = await res.json();
        if (cancelled) return;
        if (!data.run) {
          // The dev server restarted, and the scrape ended with it.
          setRun((r) => r && { ...r, status: "failed", finishedAt: new Date().toISOString() });
          setLines((prev) => [...prev, { text: "Lost the scrape: the server restarted.", stderr: true }]);
          return;
        }
        show(data, data.run.id === id);
        if (data.run.status !== "running") {
          router.refresh();
          return;
        }
      } catch {
        // The server is busy or restarting: try again.
      }
      if (!cancelled) timer = setTimeout(poll, 1000);
    };

    timer = setTimeout(poll, 1000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [run?.id, run?.status]);

  useEffect(() => {
    if (!running) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [running]);

  // Keep the newest output in view, unless the student has scrolled up to read.
  useEffect(() => {
    if (log.current && stickToBottom.current) log.current.scrollTop = log.current.scrollHeight;
  }, [lines]);

  const start = async () => {
    setError(null);
    let body: ScrapeOptions;
    try {
      body = parseScrapeOptions(chosen);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    setSending(true);
    try {
      const res = await fetch("/api/scraper", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) setError(data.error);
      // Also sent when one was already running, which the page then follows.
      if (data.run) {
        stickToBottom.current = true;
        show(data, false);
      }
    } catch {
      setError("Couldn't reach the app's server.");
    } finally {
      setSending(false);
    }
  };

  const stop = async () => {
    try {
      const res = await fetch("/api/scraper", { method: "DELETE" });
      if (!res.ok) setError((await res.json()).error);
    } catch {
      setError("Couldn't reach the app's server.");
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="space-y-5 p-5">
        <h2 className="text-xl font-semibold text-text">Canvas scraper</h2>

        <form onSubmit={saveCanvas} className="max-w-xl space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-text">Canvas URL</span>
            <input
              className={FIELD}
              value={canvasUrl}
              onChange={(e) => {
                setCanvasUrl(e.target.value);
                setCanvasMessage(null);
              }}
              placeholder="https://canvas.uts.edu.au"
              inputMode="url"
              spellCheck={false}
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-text">API token</span>
            <input
              type="password"
              className={FIELD}
              value={token}
              onChange={(e) => {
                setToken(e.target.value);
                setCanvasMessage(null);
              }}
              placeholder={setup.token ? "Saved. Paste a new one to replace it." : "Paste your access token"}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Make one in Canvas under Account › Settings › New access token. It&apos;s saved in
              scraper/.env on this computer.
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!canvasChanged || savingCanvas} className={PRIMARY_BUTTON}>
              Save
            </button>
            {canvasMessage && (
              <span className={`text-sm ${canvasMessage.error ? "text-error" : "text-success"}`}>
                {canvasMessage.text}
              </span>
            )}
          </div>
        </form>

        <p className="text-sm text-text-muted">
          Last scrape:{" "}
          <span className="text-text">
            {lastScrape
              ? [
                  format(new Date(lastScrape.at), "EEE d MMM, h:mm a"),
                  `${lastScrape.subjects.length} subject${lastScrape.subjects.length === 1 ? "" : "s"}`,
                  lastScrape.session,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "not yet"}
          </span>
        </p>

        {lastScrape && lastScrape.subjects.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {lastScrape.subjects.map((s) => (
              <li key={s.id} className="rounded-full border border-border px-3 py-1 text-xs text-text-muted">
                {s.code ? `${s.code} · ${s.name}` : s.name}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid gap-6 border-t border-border-light p-5 md:grid-cols-2">
        <fieldset className="space-y-2.5">
          <legend className={HEADING}>Subjects</legend>
          <Choice
            label="Current session"
            hint="The one running today."
            checked={options.sessionMode === "current"}
            onChange={() => set("sessionMode", "current")}
          />
          <Choice
            label="A session by name"
            flag="--session"
            checked={options.sessionMode === "named"}
            onChange={() => set("sessionMode", "named")}
          />
          {options.sessionMode === "named" && (
            <div className="pl-6">
              <input
                className={FIELD}
                value={options.sessionName}
                onChange={(e) => set("sessionName", e.target.value)}
                placeholder="Spring 2026"
                aria-label="Session name"
              />
            </div>
          )}
          <Choice
            label="Every session"
            flag="--all-sessions"
            checked={options.sessionMode === "all"}
            onChange={() => set("sessionMode", "all")}
          />
          <Check
            label="Include finished sessions"
            flag="--include-concluded"
            checked={options.includeConcluded}
            onChange={(v) => set("includeConcluded", v)}
          />
          <Check
            label="Include courses without a subject code"
            flag="--include-non-subjects"
            hint="Induction modules, academic integrity, org sites."
            checked={options.includeNonSubjects}
            onChange={(v) => set("includeNonSubjects", v)}
          />
          <label className="block pt-1">
            <Option label="Only these subjects" flag="--courses" />
            <input
              className={`${FIELD} mt-1.5`}
              value={coursesText}
              onChange={(e) => setCoursesText(e.target.value)}
              placeholder="41052 41201"
            />
            <span className="mt-1 block text-xs text-text-muted">
              Subject codes or course IDs. Skips the session filter.
            </span>
          </label>
        </fieldset>

        <div className="space-y-6">
          <fieldset className="space-y-2.5">
            <legend className={HEADING}>Files</legend>
            <Check
              label="Download files"
              flag="--download"
              hint="Into scraper/out/files."
              checked={options.download || options.extract}
              disabled={options.extract}
              onChange={(v) => set("download", v)}
            />
            <Check
              label="Convert them to markdown"
              flag="--extract"
              hint="Downloads them too."
              checked={options.extract}
              onChange={(v) => set("extract", v)}
            />
            <Check
              label="OCR scanned PDFs"
              flag="--ocr"
              hint="macOS only, and slow. Needs --extract."
              checked={options.extract && options.ocr}
              disabled={!options.extract}
              onChange={(v) => set("ocr", v)}
            />
          </fieldset>

          <fieldset className="space-y-2.5">
            <legend className={HEADING}>Output</legend>
            <Check
              label="JSON only"
              flag="--no-render"
              hint="Skip the markdown views."
              checked={options.noRender}
              onChange={(v) => set("noRender", v)}
            />
            <Check
              label="Drop UTS template pages"
              flag="--drop-boilerplate"
              hint="Remove them instead of flagging them."
              checked={options.dropBoilerplate}
              onChange={(v) => set("dropBoilerplate", v)}
            />
            <Check
              label="Pretty-print the JSON"
              flag="--pretty"
              hint="Easier to read, about 8% more tokens."
              checked={options.pretty}
              onChange={(v) => set("pretty", v)}
            />
          </fieldset>

          <fieldset className="space-y-2.5">
            <legend className={HEADING}>Run</legend>
            <Check
              label="Ignore cached responses"
              flag="--refresh"
              hint="Fetch everything from Canvas again."
              checked={options.refresh}
              onChange={(v) => set("refresh", v)}
            />
            <Check label="Less output" flag="--quiet" checked={options.quiet} onChange={(v) => set("quiet", v)} />
            <label className="block pt-1">
              <Option label="Timezone" flag="--timezone" />
              <input
                className={`${FIELD} mt-1.5`}
                value={options.timezone}
                onChange={(e) => set("timezone", e.target.value)}
              />
            </label>
          </fieldset>
        </div>
      </div>

      <div className="space-y-3 border-t border-border-light p-5">
        <div className="flex flex-wrap items-center gap-3">
          <code
            className="min-w-0 flex-1 break-all rounded-md bg-surface-muted px-3 py-2 font-mono text-xs text-text"
            aria-label="Command"
          >
            {commandLine(chosen)}
          </code>
          {running ? (
            <button type="button" onClick={stop} className={SECONDARY_BUTTON}>
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={start}
              disabled={blockers.length > 0 || sending}
              className={PRIMARY_BUTTON}
            >
              Run scrape
            </button>
          )}
        </div>
        {[...blockers, ...(error ? [error] : [])].map((message) => (
          <p key={message} className="text-sm text-error">
            {message}
          </p>
        ))}
      </div>

      {run && (
        <div className="space-y-3 border-t border-border-light p-5">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`h-2.5 w-2.5 rounded-full ${STATUS_DOT[run.status]}`} aria-hidden="true" />
            <span className="text-text">{statusText(run, now)}</span>
            {run.status === "succeeded" && (
              <Link href="/notes" className="font-medium text-primary hover:underline">
                Open Notes
              </Link>
            )}
          </div>
          <pre
            ref={log}
            role="log"
            aria-label="Scraper output"
            onScroll={(e) => {
              const el = e.currentTarget;
              stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
            }}
            className="max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black p-4 font-mono text-xs leading-relaxed text-surface-muted"
          >
            <span className="text-primary-light">$ {run.command}</span>
            {"\n"}
            {lines.map((line, i) => (
              <span key={i} className={line.stderr ? "text-secondary" : undefined}>
                {line.text}
                {"\n"}
              </span>
            ))}
          </pre>
        </div>
      )}
    </section>
  );
}

const STATUS_DOT: Record<ScrapeRun["status"], string> = {
  running: "animate-pulse bg-secondary",
  succeeded: "bg-success",
  failed: "bg-error",
  stopped: "bg-text-light",
};

function statusText(run: ScrapeRun, now: number | null): string {
  const end = run.finishedAt ? Date.parse(run.finishedAt) : now;
  const took = end === null ? "" : duration(end - Date.parse(run.startedAt));
  switch (run.status) {
    case "running":
      return took ? `Scraping… ${took}` : "Scraping…";
    case "succeeded":
      return `Finished in ${took}.`;
    case "stopped":
      return `Stopped after ${took}.`;
    case "failed":
      return `Failed after ${took}${run.exitCode === null ? "" : ` (exit code ${run.exitCode})`}. The output says why.`;
  }
}

/** m:ss */
function duration(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

function Option({ label, flag, hint }: { label: string; flag?: string; hint?: string }) {
  return (
    <span className="text-sm">
      <span className="text-text">{label}</span>
      {flag && <code className="ml-2 font-mono text-xs text-text-light">{flag}</code>}
      {hint && <span className="block text-xs text-text-muted">{hint}</span>}
    </span>
  );
}

function Check({
  label,
  flag,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  flag: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className={`flex gap-2.5 ${disabled ? "opacity-50" : "cursor-pointer"}`}>
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <Option label={label} flag={flag} hint={hint} />
    </label>
  );
}

function Choice({
  label,
  flag,
  hint,
  checked,
  onChange,
}: {
  label: string;
  flag?: string;
  hint?: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer gap-2.5">
      <input
        type="radio"
        name="session"
        className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
        checked={checked}
        onChange={onChange}
      />
      <Option label={label} flag={flag} hint={hint} />
    </label>
  );
}
