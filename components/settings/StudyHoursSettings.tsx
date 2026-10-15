"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { StudyHours } from "@/lib/data/study-preferences";

interface Props {
  /** What's saved, or the scheduler's defaults; null if they couldn't be loaded. */
  hours: StudyHours | null;
}

const FIELD =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-primary-light focus:shadow-focus focus:outline-none";
const PRIMARY_BUTTON =
  "rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-on-primary transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50";
const DAY_BUTTON =
  "rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus:shadow-focus focus:outline-none";

/** ISO weekdays, Monday first. */
const DAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" },
];

const DAILY_LIMITS = [30, 60, 90, 120, 150, 180, 240, 300, 360, 480];

const duration = (minutes: number) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} ${h === 1 ? "hour" : "hours"}` : `${h}h ${m}m`;
};

const minutesOf = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

// Settings › Study hours: when in the day, and on which days, AI subtasks go
// on the calendar, and how much study a day at most (lib/subtasks/schedule).
export function StudyHoursSettings({ hours }: Props) {
  const router = useRouter();
  const [start, setStart] = useState(hours?.start ?? "18:00");
  const [end, setEnd] = useState(hours?.end ?? "21:00");
  const [maxDaily, setMaxDaily] = useState(hours?.maxDailyMinutes ?? 180);
  const [days, setDays] = useState<number[]>(hours?.studyDays ?? [1, 2, 3, 4, 5]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);

  const changed = <T,>(set: (value: T) => void) => (value: T) => {
    set(value);
    setMessage(null);
  };
  const toggleDay = (day: number) =>
    changed(setDays)(days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b));

  // A saved limit that isn't one of the choices stays selectable.
  const limits = DAILY_LIMITS.includes(maxDaily) ? DAILY_LIMITS : [...DAILY_LIMITS, maxDaily].sort((a, b) => a - b);
  const span = start && end ? minutesOf(end) - minutesOf(start) : 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/study-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start, end, maxDailyMinutes: maxDaily, studyDays: days }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage({ text: data.error, error: true });
        return;
      }
      setMessage({ text: "Saved. New subtasks will use these hours.", error: false });
      router.refresh();
    } catch {
      setMessage({ text: "Couldn't reach the app's server.", error: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
      <h2 className="text-xl font-semibold text-text">Study hours</h2>
      <p className="mt-1 text-sm text-text-muted">
        When Canoka puts the subtasks it makes for an assessment on your calendar. It works around your classes and
        uses other days only when a deadline doesn&apos;t leave enough time. Subtasks already on your calendar stay
        where they are. To move them, use Regenerate.
      </p>
      {!hours && (
        <p className="mt-2 text-sm text-error">Couldn&apos;t load your saved hours, so these are the defaults.</p>
      )}
      <form onSubmit={save} className="mt-4 max-w-xl space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-sm text-text">Start</span>
            <input type="time" required className={FIELD} value={start} onChange={(e) => changed(setStart)(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-sm text-text">Finish</span>
            <input type="time" required className={FIELD} value={end} onChange={(e) => changed(setEnd)(e.target.value)} />
          </label>
        </div>

        <fieldset>
          <legend className="mb-1.5 block text-sm text-text">Study days</legend>
          <div className="flex flex-wrap gap-2">
            {DAYS.map((d) => {
              const on = days.includes(d.value);
              return (
                <button
                  key={d.value}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d.value)}
                  className={`${DAY_BUTTON} ${
                    on
                      ? "border-primary bg-primary text-on-primary"
                      : "border-border bg-surface text-text hover:border-primary-light hover:bg-surface-muted"
                  }`}
                >
                  {d.label}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="block">
          <span className="mb-1.5 block text-sm text-text">At most a day</span>
          <select className={FIELD} value={maxDaily} onChange={(e) => changed(setMaxDaily)(Number(e.target.value))}>
            {limits.map((m) => (
              <option key={m} value={m}>
                {duration(m)}
              </option>
            ))}
          </select>
          {span > 0 && maxDaily > span && (
            <span className="mt-1 block text-xs text-text-muted">
              Your hours only leave {duration(span)} a day, so that&apos;s the most you&apos;ll get.
            </span>
          )}
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={saving || days.length === 0 || !start || !end} className={PRIMARY_BUTTON}>
            Save
          </button>
          {message && (
            <span className={`text-sm ${message.error ? "text-error" : "text-success"}`}>{message.text}</span>
          )}
        </div>
      </form>
    </section>
  );
}
