"use client";

import { useState } from "react";
import { format } from "date-fns";
import type { SavedReview } from "@/lib/notes/storage";
import { ChevronIcon, SparkleIcon } from "@/components/shell/icons";

interface Props {
  /** e.g. "Week 3". */
  label: string;
  saved: SavedReview | undefined;
  reviewing: boolean;
  error: string | null;
}

// The AI review of a week's notes, under the note it was asked from: what the
// notes cover, what they miss, what to fix, and questions to test yourself.
export function WeekReview({ label, saved, reviewing, error }: Props) {
  const [open, setOpen] = useState(true);

  if (reviewing) {
    return (
      <section className="note-review" aria-live="polite">
        <p className="flex items-center gap-2 text-sm text-text-muted">
          <SparkleIcon className="animate-pulse text-primary" />
          Reviewing your {label} notes against the course content. This can take up to a minute.
        </p>
      </section>
    );
  }
  if (error) {
    return (
      <section className="note-review" aria-live="polite">
        <p className="text-sm text-error">{error}</p>
      </section>
    );
  }
  if (!saved) return null;

  const { review } = saved;
  return (
    <section className="note-review" aria-live="polite">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 text-left text-sm font-semibold text-text"
      >
        <SparkleIcon className="shrink-0 text-primary" />
        <span className="min-w-0 flex-1">
          AI review of your {label} notes
          <span className="ml-2 font-normal text-text-muted">
            {format(new Date(saved.at), "d MMM, h:mm a")} · {saved.notes} note{saved.notes === 1 ? "" : "s"}
          </span>
        </span>
        <ChevronIcon dir="right" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      </button>

      {open && (
        <div className="mt-3 space-y-4 text-sm">
          {!saved.hadCourseContent && (
            <p className="text-text-muted">
              There was no course content saved for {label}, so this checks your notes on their own rather than
              against the course.
            </p>
          )}
          {saved.contentStale && (
            <p className="text-secondary-dark">
              Canvas couldn&apos;t be reached{saved.staleReason ? ` (${saved.staleReason})` : ""}, so this used course
              content saved earlier. It may be out of date.
            </p>
          )}
          {saved.hadCourseContent && saved.contentUpdatedAt && (
            <p className="text-text-muted">
              Checked against course content saved {format(new Date(saved.contentUpdatedAt), "d MMM, h:mm a")}.
            </p>
          )}
          <p className="text-text">{review.summary}</p>
          <Findings title="Covered well" items={review.covered} tone="text-success" />
          <Findings title="Missing" items={review.missing} tone="text-secondary-dark" />
          <Findings title="Check these" items={review.corrections} tone="text-error" />
          <Findings title="Test yourself" items={review.questions} tone="text-primary" />
        </div>
      )}
    </section>
  );
}

function Findings({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${tone}`}>{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-text">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
