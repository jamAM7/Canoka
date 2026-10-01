"use client";

import { useEffect, useState } from "react";
import type { Subject } from "@/lib/scraper/subjects";
import { newId } from "@/lib/calendar/kanban";
import {
  loadNotes,
  loadReviews,
  noteText,
  reviewKey,
  saveNotes,
  saveReviews,
  type Note,
  type SavedReview,
} from "@/lib/notes/storage";
import { ChevronIcon, PanelIcon, PlusIcon, SparkleIcon } from "@/components/shell/icons";
import { NoteEditor } from "./NoteEditor";
import { WeekReview } from "./WeekReview";

interface Props {
  subjects: Subject[];
}

interface WeekGroup {
  /** Null for a subject's notes that don't have a week yet. */
  number: number | null;
  title: string | null;
  notes: Note[];
}

interface Group {
  /** The subject's id, or OTHER. */
  id: string;
  title: string;
  weeks: WeekGroup[];
}

/** Notes whose subject the scraper no longer lists, e.g. from a past session. */
const OTHER = "other";

const ICON_BUTTON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text";
const SMALL_ICON_BUTTON =
  "grid h-7 w-7 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text";

/** The list: each subject's weeks with their notes (newest first), then other notes. */
function groupNotes(notes: Note[], subjects: Subject[]): Group[] {
  const groups: Group[] = subjects.map((subject) => {
    const mine = notes.filter((n) => n.courseId === subject.id);
    const weeks: WeekGroup[] = subject.weeks.map((week) => ({
      number: week.number,
      title: week.title,
      notes: mine.filter((n) => n.week === week.number),
    }));
    const listed = new Set(subject.weeks.map((w) => w.number));
    const loose = mine.filter((n) => n.week === null || !listed.has(n.week));
    if (loose.length > 0) weeks.push({ number: null, title: null, notes: loose });
    return { id: subject.id, title: subject.code ? `${subject.code} · ${subject.name}` : subject.name, weeks };
  });
  const listed = new Set(subjects.map((s) => s.id));
  const others = notes.filter((n) => !listed.has(n.courseId));
  if (others.length > 0) {
    groups.push({ id: OTHER, title: "Other notes", weeks: [{ number: null, title: null, notes: others }] });
  }
  return groups;
}

/** Notes in the order the list shows them. */
function inListOrder(notes: Note[], subjects: Subject[]): Note[] {
  return groupNotes(notes, subjects).flatMap((g) => g.weeks.flatMap((w) => w.notes));
}

/** A note's first line of text, for its preview in the list. */
function firstLine(content: string): string {
  return noteText(content).split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

/** Key for a week's collapsed state in the list. */
const weekKey = (subjectId: string, week: number | null) => `${subjectId}:${week ?? "none"}`;

// Notes view: the student's notes by subject and week in a collapsible list on
// the left; the selected note on the right, with an AI review of its week.
// TODO: load real notes from `subjects` + `notes` and save edits back.
export function NotesContent({ subjects }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<Record<string, SavedReview>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<{ key: string; message: string } | null>(null);
  const [loaded, setLoaded] = useState(false);

  // Read saved notes after mount so server and client render the same markup.
  useEffect(() => {
    const saved = loadNotes() ?? [];
    const first = inListOrder(saved, subjects)[0];
    setNotes(saved);
    setActiveId(first?.id ?? null);
    // Every subject lists a whole session of weeks, so only the open note's starts expanded.
    const open = first?.courseId ?? subjects[0]?.id;
    setClosed(new Set(subjects.map((s) => s.id).filter((id) => id !== open)));
    setReviews(loadReviews());
    setLoaded(true);
  }, [subjects]);

  useEffect(() => {
    if (loaded) saveNotes(notes);
  }, [notes, loaded]);

  useEffect(() => {
    if (loaded) saveReviews(reviews);
  }, [reviews, loaded]);

  const toggle = (key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  // Opens the subject and the week too, so the new note shows in the list.
  const addNote = (subjectId: string, week: number) => {
    const note: Note = { id: newId("note"), courseId: subjectId, week, title: "", content: "" };
    setNotes((prev) => [note, ...prev]);
    setClosed((prev) => {
      const next = new Set(prev);
      next.delete(subjectId);
      next.delete(weekKey(subjectId, week));
      return next;
    });
    setActiveId(note.id);
  };

  const updateNote = (id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  // Open the next note in the list in its place, or the previous one if it was last.
  const deleteNote = (id: string) => {
    const list = inListOrder(notes, subjects);
    const i = list.findIndex((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActiveId((list[i + 1] ?? list[i - 1])?.id ?? null);
  };

  const reviewWeek = async (subjectId: string, week: number) => {
    const key = reviewKey(subjectId, week);
    const weekNotes = notes.filter((n) => n.courseId === subjectId && n.week === week);
    setReviewing(key);
    setReviewError(null);
    try {
      const res = await fetch("/api/notes/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subjectId,
          week,
          notes: weekNotes.map(({ title, content }) => ({ title, content })),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError({ key, message: data.error ?? "The review didn't work. Try again." });
        return;
      }
      setReviews((prev) => ({
        ...prev,
        [key]: {
          at: new Date().toISOString(),
          notes: weekNotes.length,
          hadCourseContent: data.hadCourseContent,
          review: data.review,
        },
      }));
    } catch {
      setReviewError({ key, message: "Couldn't reach the app's server." });
    } finally {
      setReviewing(null);
    }
  };

  const groups = groupNotes(notes, subjects);
  const active = notes.find((n) => n.id === activeId);
  const activeSubject = active ? subjects.find((s) => s.id === active.courseId) : undefined;
  const activeWeek = active?.week ?? null;
  const activeReviewKey = activeSubject && activeWeek !== null ? reviewKey(activeSubject.id, activeWeek) : null;

  const noteButton = (note: Note) => (
    <button
      key={note.id}
      type="button"
      className={`note-item${note.id === activeId ? " active" : ""}`}
      onClick={() => setActiveId(note.id)}
    >
      <div className="note-item-title">{note.title || "Untitled"}</div>
      <p className="note-item-preview">{firstLine(note.content) || "No text yet"}</p>
    </button>
  );

  const weekRow = (group: Group, week: WeekGroup) => {
    const key = weekKey(group.id, week.number);
    const open = !closed.has(key);
    const label = week.number === null ? "No week" : `Week ${week.number}`;
    const name = (
      <span className="min-w-0 flex-1 truncate" title={week.title ? `${label}: ${week.title}` : label}>
        {label}
        {week.title && <span className="text-text-muted"> · {week.title}</span>}
      </span>
    );
    return (
      <div key={key} className="notes-week">
        <div className="notes-week-header">
          {week.notes.length > 0 ? (
            <button type="button" onClick={() => toggle(key)} aria-expanded={open} className="notes-week-toggle">
              <ChevronIcon dir="right" className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
              {name}
              <span className="notes-week-count">{week.notes.length}</span>
            </button>
          ) : (
            <span className="notes-week-toggle">
              <span className="w-4 shrink-0" />
              {name}
            </span>
          )}
          {week.number !== null && (
            <button
              type="button"
              onClick={() => addNote(group.id, week.number as number)}
              aria-label={`New note in ${label} of ${group.title}`}
              title={`New note in ${label}`}
              className={SMALL_ICON_BUTTON}
            >
              <PlusIcon />
            </button>
          )}
        </div>
        {open && week.notes.map(noteButton)}
      </div>
    );
  };

  return (
    <div className="space-y-6 p-8 md:p-10">
      <header className="px-2 pt-2">
        <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">Notes</h1>
        <p className="mt-1 text-sm text-text-muted">
          AI-generated notes for each subject and week, built from your Canvas content.
        </p>
      </header>

      <div className={`notes-layout${listOpen ? "" : " list-hidden"}`}>
        {/* Collapses to a strip holding just the toggle, so the list can always be reopened. */}
        <aside className="notes-list">
          <div className="notes-list-header">
            <button
              type="button"
              onClick={() => setListOpen((o) => !o)}
              aria-controls="notes-list-groups"
              aria-expanded={listOpen}
              aria-label={listOpen ? "Hide notes list" : "Show notes list"}
              title={listOpen ? "Hide notes list" : "Show notes list"}
              className={ICON_BUTTON}
            >
              <PanelIcon />
            </button>
          </div>

          <div id="notes-list-groups" hidden={!listOpen}>
            {subjects.length === 0 && (
              <p className="px-5 pb-4 text-sm text-text-muted">
                No subjects yet. Run the Canvas scraper (scraper/scrape.py), then reload this page.
              </p>
            )}

            {groups.map((group) => {
              const expanded = !closed.has(group.id);
              const count = group.weeks.reduce((sum, w) => sum + w.notes.length, 0);
              return (
                <div key={group.id} className="notes-group">
                  <div className="notes-group-header">
                    <h2 className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggle(group.id)}
                        aria-expanded={expanded}
                        aria-controls={`notes-group-${group.id}`}
                        className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-text-light transition-colors hover:text-text"
                      >
                        <ChevronIcon
                          dir="right"
                          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                        />
                        <span className="min-w-0">{group.title}</span>
                        {!expanded && count > 0 && (
                          <span className="ml-auto rounded-full bg-surface-muted px-2 text-text-muted">
                            {count}
                            <span className="sr-only">{count === 1 ? " note" : " notes"}</span>
                          </span>
                        )}
                      </button>
                    </h2>
                  </div>

                  <div id={`notes-group-${group.id}`} hidden={!expanded}>
                    {group.id === OTHER
                      ? group.weeks[0].notes.map(noteButton)
                      : group.weeks.map((week) => weekRow(group, week))}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="note-editor">
          {active ? (
            <>
              {activeSubject && (
                <div className="note-context">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold uppercase tracking-wide text-text-light">
                      {activeSubject.code ? `${activeSubject.code} · ${activeSubject.name}` : activeSubject.name}
                    </p>
                    <select
                      aria-label="Week"
                      value={activeWeek ?? ""}
                      onChange={(e) => updateNote(active.id, { week: e.target.value ? Number(e.target.value) : null })}
                      className="note-week-select"
                    >
                      {activeWeek === null && <option value="">No week</option>}
                      {activeSubject.weeks.map((week) => (
                        <option key={week.number} value={week.number}>
                          {week.title ? `Week ${week.number}: ${week.title}` : `Week ${week.number}`}
                        </option>
                      ))}
                    </select>
                  </div>
                  {activeWeek !== null && activeReviewKey && (
                    <button
                      type="button"
                      onClick={() => reviewWeek(activeSubject.id, activeWeek)}
                      disabled={reviewing !== null}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <SparkleIcon className="text-primary" />
                      {reviewing === activeReviewKey
                        ? "Reviewing…"
                        : reviews[activeReviewKey]
                          ? "Review again"
                          : `Review week ${activeWeek} with AI`}
                    </button>
                  )}
                </div>
              )}

              {activeReviewKey && (
                <WeekReview
                  key={activeReviewKey}
                  label={`week ${activeWeek}`}
                  saved={reviews[activeReviewKey]}
                  reviewing={reviewing === activeReviewKey}
                  error={reviewError?.key === activeReviewKey ? reviewError.message : null}
                />
              )}

              <NoteEditor
                key={active.id}
                note={active}
                onChange={(patch) => updateNote(active.id, patch)}
                onDelete={() => deleteNote(active.id)}
              />
            </>
          ) : (
            <p className="text-text-muted">
              {notes.length > 0
                ? "Select a note to see it here."
                : subjects.length > 0
                  ? "No notes yet. Add one with + next to a week."
                  : "No notes yet."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
