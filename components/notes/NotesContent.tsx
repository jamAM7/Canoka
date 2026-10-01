"use client";

import { useEffect, useRef, useState } from "react";
import type { NoteDoc, NotesSubject } from "@/lib/notes/types";
import { docText } from "@/lib/notes/text";
import { reviewKey, toSavedReview, type Note, type SavedReview } from "@/lib/notes/storage";
import { ChevronIcon, PanelIcon, PlusIcon, SparkleIcon } from "@/components/shell/icons";
import { NoteEditor } from "./NoteEditor";
import { WeekReview } from "./WeekReview";

interface Props {
  subjects: NotesSubject[];
  /** The student's notes, from the database. */
  initialNotes: Note[];
}

/** What a save sends for a note: only what changed. */
interface NotePatch {
  title?: string;
  content?: NoteDoc;
  moduleId?: string;
}

/** Edits go to the server once typing pauses. Each saved change to a note's text adds a history row. */
const SAVE_DELAY_MS = 1500;
const RETRY_DELAY_MS = 5000;

const JSON_HEADERS = { "Content-Type": "application/json" };

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
function groupNotes(notes: Note[], subjects: NotesSubject[]): Group[] {
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
function inListOrder(notes: Note[], subjects: NotesSubject[]): Note[] {
  return groupNotes(notes, subjects).flatMap((g) => g.weeks.flatMap((w) => w.notes));
}

/** A note's first line of text, for its preview in the list. */
function firstLine(content: NoteDoc): string {
  return docText(content).split("\n").map((line) => line.trim()).find(Boolean) ?? "";
}

/** Key for a week's collapsed state in the list. */
const weekKey = (subjectId: string, week: number | null) => `${subjectId}:${week ?? "none"}`;

// Notes view: the student's notes by subject and week in a collapsible list on
// the left; the selected note on the right, with an AI review of its week.
// Notes are saved to Supabase through /api/notes as the student types.
export function NotesContent({ subjects, initialNotes }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [listOpen, setListOpen] = useState(true);
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [reviews, setReviews] = useState<Record<string, SavedReview>>({});
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<{ key: string; message: string } | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edits wait here until typing pauses. One request per note at a time, so saves land in order.
  const pending = useRef(new Map<string, NotePatch>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const saving = useRef(new Set<string>());

  // Show the notes after mount, as before, so server and client render the same markup.
  useEffect(() => {
    const first = inListOrder(initialNotes, subjects)[0];
    setNotes(initialNotes);
    setActiveId(first?.id ?? null);
    // Every subject lists a whole session of weeks, so only the open note's starts expanded.
    const open = first?.courseId ?? subjects[0]?.id;
    setClosed(new Set(subjects.map((s) => s.id).filter((id) => id !== open)));
  }, [subjects, initialNotes]);

  // Sends a note's waiting edits now. `unload` lets the request outlive the page.
  const flush = (id: string, unload = false) => {
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    const patch = pending.current.get(id);
    if (!patch) return;
    if (saving.current.has(id)) {
      timers.current.set(id, setTimeout(() => flush(id), 300));
      return;
    }
    pending.current.delete(id);
    saving.current.add(id);
    fetch(`/api/notes/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
      keepalive: unload,
    })
      .then(async (res) => {
        if (!res.ok) throw new Error((await res.json().catch(() => null))?.error ?? "The server refused the save.");
        setSaveError(null);
      })
      .catch((error: Error) => {
        // Keep the edit, under anything typed since, and try again shortly.
        pending.current.set(id, { ...patch, ...pending.current.get(id) });
        if (!timers.current.has(id)) timers.current.set(id, setTimeout(() => flush(id), RETRY_DELAY_MS));
        setSaveError(`Couldn't save your changes (${error.message}) Trying again…`);
      })
      .finally(() => saving.current.delete(id));
  };

  const queueSave = (id: string, patch: NotePatch) => {
    pending.current.set(id, { ...pending.current.get(id), ...patch });
    clearTimeout(timers.current.get(id));
    timers.current.set(id, setTimeout(() => flush(id), SAVE_DELAY_MS));
  };

  // Don't lose the last few seconds of typing when the student leaves the page.
  useEffect(() => {
    const flushAll = () => Array.from(pending.current.keys()).forEach((id) => flush(id, true));
    window.addEventListener("pagehide", flushAll);
    return () => {
      window.removeEventListener("pagehide", flushAll);
      flushAll();
    };
  }, []);

  const toggle = (key: string) => {
    setClosed((prev) => {
      const next = new Set(prev);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  };

  // The server makes the note (every note belongs to a week's module), then it
  // opens the subject and the week too, so it shows in the list.
  const addNote = async (subjectId: string, week: number) => {
    const moduleId = subjects.find((s) => s.id === subjectId)?.weeks.find((w) => w.number === week)?.moduleId;
    if (!moduleId) return;
    try {
      const res = await fetch("/api/notes", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ courseId: subjectId, moduleId }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Couldn't add the note.");
        return;
      }
      const note: Note = data.note;
      setSaveError(null);
      setNotes((prev) => [note, ...prev]);
      setClosed((prev) => {
        const next = new Set(prev);
        next.delete(subjectId);
        next.delete(weekKey(subjectId, week));
        return next;
      });
      setActiveId(note.id);
    } catch {
      setSaveError("Couldn't reach the app's server.");
    }
  };

  const updateNote = (id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
    const save: NotePatch = {};
    if (patch.title !== undefined) save.title = patch.title;
    if (patch.content !== undefined) save.content = patch.content;
    if (Object.keys(save).length > 0) queueSave(id, save);
  };

  // Moves a note to another week of its subject, saved at once.
  const moveToWeek = (id: string, subject: NotesSubject, week: number) => {
    const target = subject.weeks.find((w) => w.number === week);
    if (!target) return;
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, week, moduleId: target.moduleId } : n)));
    queueSave(id, { moduleId: target.moduleId });
    flush(id);
  };

  // Open the next note in the list in its place, or the previous one if it was last.
  // The server archives it rather than deleting it.
  const deleteNote = (id: string) => {
    const list = inListOrder(notes, subjects);
    const i = list.findIndex((n) => n.id === id);
    clearTimeout(timers.current.get(id));
    timers.current.delete(id);
    pending.current.delete(id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    setActiveId((list[i + 1] ?? list[i - 1])?.id ?? null);
    fetch(`/api/notes/${id}`, { method: "DELETE" })
      .then((res) => {
        if (!res.ok) setSaveError("Couldn't delete the note. It will be back when you reload.");
      })
      .catch(() => setSaveError("Couldn't reach the app's server."));
  };

  // The review reads the week's notes from the database, so edits still waiting to be saved go first.
  const saveBeforeReview = async (ids: string[]) => {
    ids.forEach((id) => flush(id));
    const deadline = Date.now() + 10_000;
    while (ids.some((id) => pending.current.has(id) || saving.current.has(id))) {
      if (Date.now() > deadline) return false;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return true;
  };

  const reviewWeek = async (subjectId: string, week: number) => {
    const key = reviewKey(subjectId, week);
    setReviewing(key);
    setReviewError(null);
    try {
      const ids = notes.filter((n) => n.courseId === subjectId && n.week === week).map((n) => n.id);
      if (!(await saveBeforeReview(ids))) {
        setReviewError({ key, message: "Your latest edits haven't saved yet. Try again once they have." });
        return;
      }
      const res = await fetch("/api/notes/review", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ courseId: subjectId, week }),
      });
      const data = await res.json();
      if (!res.ok) {
        setReviewError({ key, message: data.error ?? "The review didn't work. Try again." });
        return;
      }
      setReviews((prev) => ({ ...prev, [key]: toSavedReview(data.review, data.staleReason) }));
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

  // Reviews are stored in the database: opening a week's note shows that week's latest.
  const askedReviews = useRef(new Set<string>());
  useEffect(() => {
    if (!activeSubject || activeWeek === null || !activeReviewKey) return;
    if (reviews[activeReviewKey] || askedReviews.current.has(activeReviewKey)) return;
    const key = activeReviewKey;
    askedReviews.current.add(key);
    fetch(`/api/notes/review?courseId=${activeSubject.id}&week=${activeWeek}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.review) setReviews((prev) => (prev[key] ? prev : { ...prev, [key]: toSavedReview(data.review) }));
      })
      .catch(() => askedReviews.current.delete(key));
  }, [activeReviewKey]);

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

      {saveError && (
        <p role="alert" className="px-2 text-sm text-error">
          {saveError}
        </p>
      )}

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
                No subjects yet. Scrape Canvas in Settings, which saves them to the database, then reload this page.
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
                      onChange={(e) => e.target.value && moveToWeek(active.id, activeSubject, Number(e.target.value))}
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
