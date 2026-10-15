"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import type { CanvasConnection } from "@/lib/data/canvas-connection";

interface Props {
  /** The saved connection, or null. Never carries the token. */
  connection: CanvasConnection | null;
  /** Why the connection couldn't be loaded, e.g. a migration that hasn't been applied. */
  problem: string | null;
}

interface SyncResult {
  synced?: { code: string | null; name: string; weeks: number; assignments: number; warnings: string[] }[];
  errors?: { subject: string; error: string }[];
  session?: string | null;
  warnings?: string[];
  error?: string;
}

interface FilesResult {
  read?: number;
  skipped?: number;
  failed?: number;
  remaining?: number;
  error?: string;
}

/** Calls to /api/canvas/files per sync, each up to about 40 seconds. What's left waits for the next sync. */
const FILE_ROUNDS = 30;

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";
const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

// Settings › Canvas: save the Canvas address and access token, then pull this
// session's subjects, weeks and assessments into the app (/api/canvas/sync),
// then read the text of their PDFs, Word and PowerPoint files, a batch at a
// time (/api/canvas/files). Works on the hosted site: everything is saved in Supabase.
export function CanvasSettings({ connection, problem }: Props) {
  const router = useRouter();
  const [canvasUrl, setCanvasUrl] = useState(connection?.baseUrl ?? "");
  // Never filled from the server: the saved token stays there.
  const [token, setToken] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [lines, setLines] = useState<{ text: string; error: boolean }[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [synced, setSynced] = useState(false);
  const changed = canvasUrl.trim() !== (connection?.baseUrl ?? "") || token.trim() !== "";

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setSaving(true);
    try {
      const res = await fetch("/api/canvas/connection", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl: canvasUrl, token }),
      });
      const data: { connection?: CanvasConnection; error?: string } = await res.json();
      if (!res.ok || !data.connection) {
        setMessage({ text: data.error ?? "Couldn't save the connection.", error: true });
        return;
      }
      setCanvasUrl(data.connection.baseUrl);
      setToken("");
      setMessage({
        text: data.connection.userName ? `Connected as ${data.connection.userName}.` : "Connected.",
        error: false,
      });
      router.refresh();
    } catch {
      setMessage({ text: "Couldn't reach the app's server.", error: true });
    } finally {
      setSaving(false);
    }
  };

  const disconnect = async () => {
    setMessage(null);
    try {
      const res = await fetch("/api/canvas/connection", { method: "DELETE" });
      if (!res.ok) {
        setMessage({ text: (await res.json()).error ?? "Couldn't remove the connection.", error: true });
        return;
      }
      setCanvasUrl("");
      setToken("");
      setLines([]);
      setMessage({ text: "Disconnected. Canoka no longer has your token.", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Couldn't reach the app's server.", error: true });
    }
  };

  const sync = async () => {
    setSyncing(true);
    setSynced(false);
    setLines([]);
    setProgress("Pulling your subjects from Canvas…");
    const out: { text: string; error: boolean }[] = [];
    const say = (text: string, error = false) => {
      out.push({ text, error });
      setLines([...out]);
    };
    try {
      const res = await fetch("/api/canvas/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data: SyncResult = await res.json();
      if (data.session) say(`Session: ${data.session}`);
      for (const warning of data.warnings ?? []) say(warning, true);
      for (const s of data.synced ?? []) {
        say(`Saved ${s.code ?? s.name}: ${s.weeks} weeks, ${s.assignments} assessments.`);
        for (const warning of s.warnings) say(warning, true);
      }
      for (const e of data.errors ?? []) say(`Couldn't save ${e.subject}: ${e.error}`, true);
      if (!res.ok && !data.errors) say(data.error ?? "Couldn't sync your subjects.", true);
      const anySynced = (data.synced?.length ?? 0) > 0;
      setSynced(anySynced);
      router.refresh();
      if (anySynced) await readFiles(say);
    } catch {
      say("Couldn't reach the app's server.", true);
    } finally {
      setProgress(null);
      setSyncing(false);
    }
  };

  // Each file is read once: a later sync only reads files Canvas has added since.
  const readFiles = async (say: (text: string, error?: boolean) => void) => {
    const total = { read: 0, skipped: 0, failed: 0 };
    let remaining = 0;
    setProgress("Reading your subjects' files…");
    for (let round = 0; round < FILE_ROUNDS; round++) {
      const res = await fetch("/api/canvas/files", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data: FilesResult = await res.json();
      if (!res.ok) {
        say(data.error ?? "Couldn't read the subjects' files.", true);
        return;
      }
      total.read += data.read ?? 0;
      total.skipped += data.skipped ?? 0;
      total.failed += data.failed ?? 0;
      remaining = data.remaining ?? 0;
      if (remaining === 0) break;
      setProgress(`Reading files: ${total.read} read, ${remaining} to go…`);
    }
    if (total.read + total.skipped + total.failed === 0 && remaining === 0) {
      say("Files: all read already.");
      return;
    }
    const parts = [`${total.read} read`];
    if (total.skipped) parts.push(`${total.skipped} skipped (not documents, too big, or locked)`);
    if (total.failed) parts.push(`${total.failed} couldn't be read, to try again next sync`);
    say(`Files: ${parts.join(", ")}.`);
    if (remaining > 0) say(`${remaining} files still to read: sync again to carry on.`, true);
  };

  return (
    <section id="canvas" className="rounded-xl border border-border bg-surface shadow-sm">
      <div className="space-y-5 p-5">
        <div>
          <h2 className="text-xl font-semibold text-text">Canvas</h2>
          <p className="mt-1 text-sm text-text-muted">
            {connection ? (
              <>
                Connected to <span className="text-text">{new URL(connection.baseUrl).host}</span>
                {connection.userName && (
                  <>
                    {" "}as <span className="text-text">{connection.userName}</span>
                  </>
                )}
                .{" "}
                <span suppressHydrationWarning>
                  {connection.lastSyncedAt
                    ? `Last synced ${format(new Date(connection.lastSyncedAt), "EEE d MMM, h:mm a")}.`
                    : "Not synced yet."}
                </span>
              </>
            ) : (
              "Not connected. Save your Canvas address and an access token to pull your subjects in."
            )}
          </p>
          {problem && <p className="mt-2 text-sm text-error">Couldn&apos;t load your Canvas connection: {problem}</p>}
        </div>

        <form onSubmit={save} className="max-w-xl space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-text">Canvas URL</span>
            <input
              className={FIELD}
              value={canvasUrl}
              onChange={(e) => {
                setCanvasUrl(e.target.value);
                setMessage(null);
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
                setMessage(null);
              }}
              placeholder={connection ? "Saved. Paste a new one to replace it." : "Paste your access token"}
              autoComplete="off"
              spellCheck={false}
            />
            <span className="mt-1 block text-xs text-text-muted">
              Make one in Canvas under Account › Settings › New access token. Canoka saves it with your account and
              never shows it again.{" "}
              <Link href="/settings/canvas-token" className="font-medium text-primary hover:underline">
                How to get one
              </Link>
            </span>
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={!changed || saving} className={PRIMARY_BUTTON}>
              {saving ? "Checking…" : "Save"}
            </button>
            {connection && (
              <button type="button" onClick={disconnect} disabled={saving || syncing} className={SECONDARY_BUTTON}>
                Disconnect
              </button>
            )}
            {message && (
              <span className={`text-sm ${message.error ? "text-error" : "text-success"}`}>{message.text}</span>
            )}
          </div>
        </form>
      </div>

      <div className="space-y-3 border-t border-border-light p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={sync} disabled={!connection || syncing} className={PRIMARY_BUTTON}>
            {syncing ? "Syncing…" : "Sync subjects"}
          </button>
          <span className="text-sm text-text-muted">
            Pulls this session&apos;s subjects, weeks and assessments from Canvas into Notes and the calendar, and
            reads their PDFs, slides and Word files for AI review. Each file is read once.
          </span>
        </div>
        {(lines.length > 0 || progress) && (
          <ul role="status" className="space-y-1 text-sm">
            {lines.map((line, i) => (
              <li key={i} className={line.error ? "text-error" : "text-text"}>
                {line.text}
              </li>
            ))}
            {progress && <li className="animate-pulse text-text-muted">{progress}</li>}
          </ul>
        )}
        {synced && (
          <Link href="/notes" className="inline-block text-sm font-medium text-primary hover:underline">
            Open Notes
          </Link>
        )}
      </div>
    </section>
  );
}
