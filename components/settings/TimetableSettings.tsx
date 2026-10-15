"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

interface Props {
  /** Whether a timetable link is saved on this machine. */
  subscribed: boolean;
}

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";
const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50";
const SECONDARY_BUTTON =
  "rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

// Settings › Timetable: the iCal subscription link from UTS My Timetable, which
// puts the student's classes on the calendar.
export function TimetableSettings({ subscribed }: Props) {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const send = async (init: RequestInit, done: (data: { classes?: number }) => string) => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/calendar/sync", init);
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error, error: true });
        return;
      }
      setUrl("");
      setMessage({ text: done(data), error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Couldn't reach the app's server.", error: true });
    } finally {
      setBusy(false);
    }
  };

  const save = (e: FormEvent) => {
    e.preventDefault();
    send(
      { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) },
      ({ classes }) => `Subscribed: ${classes} ${classes === 1 ? "class" : "classes"} on your calendar.`,
    );
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-text">Timetable</h2>
      <form onSubmit={save} className="mt-4 max-w-xl space-y-3">
        <label className="block">
          <span className="mb-1.5 block text-sm text-text">Timetable subscription link</span>
          <input
            type="text"
            inputMode="url"
            className={FIELD}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value);
              setMessage(null);
            }}
            placeholder={
              subscribed
                ? "Subscribed. Paste a new link to replace it."
                : "https://mytimetablecloud.uts.edu.au/…/calendar/ical/…"
            }
            autoComplete="off"
            spellCheck={false}
          />
          <span className="mt-1 block text-xs text-text-muted">
            Puts your classes on the calendar as University Timetable. Copy the iCal subscription link from UTS My
            Timetable. Anyone with the link can see your timetable, so it&apos;s saved only in .env.local on this
            computer.
          </span>
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!url.trim() || busy} className={PRIMARY_BUTTON}>
            {subscribed ? "Replace" : "Subscribe"}
          </button>
          {subscribed && (
            <button
              type="button"
              disabled={busy}
              className={SECONDARY_BUTTON}
              onClick={() => send({ method: "DELETE" }, () => "Unsubscribed.")}
            >
              Unsubscribe
            </button>
          )}
          {message && (
            <span className={`text-sm ${message.error ? "text-error" : "text-success"}`}>{message.text}</span>
          )}
        </div>
      </form>
    </section>
  );
}
