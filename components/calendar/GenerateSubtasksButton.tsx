"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { summarise, type Summary } from "@/lib/subtasks/summary";

const BUTTON =
  "inline-flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50";

const REGENERATE_WARNING =
  "Regenerating replaces every AI-generated subtask for these assessments, including any you have marked " +
  "completed. This can't be undone. Continue?";

// Generate AI subtasks for the assessments that don't have any yet, and put
// them on the calendar between now and each deadline (POST /api/subtasks/generate).
// "Regenerate" does it again for assessments that already have them, after confirming.
export function GenerateSubtasksButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function run(regenerate: boolean) {
    if (regenerate && !window.confirm(REGENERATE_WARNING)) return;
    setBusy(true);
    setSummary(null);
    try {
      const res = await fetch("/api/subtasks/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSummary({ text: data.error ?? "Couldn't generate subtasks.", error: true });
        return;
      }
      setSummary(summarise(data));
      // The calendar's events come from the server: load them again to show the new subtasks.
      if (data.created.length > 0) router.refresh();
    } catch {
      setSummary({ text: "Couldn't reach the app's server.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => run(false)} disabled={busy} className={BUTTON}>
          {busy ? "Generating… this can take a minute or two" : "Generate subtasks"}
        </button>
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy}
          className="text-sm text-text-muted underline-offset-2 hover:text-text hover:underline disabled:cursor-not-allowed disabled:opacity-50"
        >
          Regenerate…
        </button>
      </div>
      {summary && (
        <p role="status" className={`max-w-md text-right text-xs ${summary.error ? "text-error" : "text-text-muted"}`}>
          {summary.text}
        </p>
      )}
    </div>
  );
}
