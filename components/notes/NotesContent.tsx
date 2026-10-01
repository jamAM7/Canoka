"use client";

import { useEffect, useState } from "react";
import type { Subject } from "@/lib/scraper/subjects";
import { newId } from "@/lib/calendar/kanban";
import { loadNotes, saveNotes, type Note } from "@/lib/notes/storage";
import { ChevronIcon, PanelIcon, PlusIcon } from "@/components/shell/icons";

interface Props {
  subjects: Subject[];
}

interface Group {
  /** The subject's id, or OTHER. */
  id: string;
  title: string;
  notes: Note[];
}

/** Notes whose subject the scraper no longer lists, e.g. from a past session. */
const OTHER = "other";

const ICON_BUTTON =
  "grid h-8 w-8 shrink-0 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface-muted hover:text-text";

/** The list's groups: one per subject, newest note first, then any other notes. */
function groupNotes(notes: Note[], subjects: Subject[]): Group[] {
  const groups = subjects.map((s) => ({
    id: s.id,
    title: s.code ? `${s.code} · ${s.name}` : s.name,
    notes: notes.filter((n) => n.courseId === s.id),
  }));
  const listed = new Set(subjects.map((s) => s.id));
  const others = notes.filter((n) => !listed.has(n.courseId));
  if (others.length > 0) groups.push({ id: OTHER, title: "Other notes", notes: others });
  return groups;
}

/** Notes in the order the list shows them. */
function inListOrder(notes: Note[], subjects: Subject[]): Note[] {
  return groupNotes(notes, subjects).flatMap((g) => g.notes);
}

// Notes view: the student's notes grouped by subject in a collapsible list on
// the left, the selected note on the right.
// TODO: load real notes from `subjects` + `notes` and save edits back.
export function NotesContent({ subjects }: Props) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const open = (id: string | null) => {
    setActiveId(id);
    setConfirmDelete(false);
  };

  // Read saved notes after mount so server and client render the same markup.
  useEffect(() => {
    const saved = loadNotes() ?? [];
    setNotes(saved);
    setActiveId(inListOrder(saved, subjects)[0]?.id ?? null);
    setLoaded(true);
  }, [subjects]);

  useEffect(() => {
    if (loaded) saveNotes(notes);
  }, [notes, loaded]);

  const toggleGroup = (id: string) => {
    setClosedGroups((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  };

  // Opens the subject's group too, so the new note shows in the list.
  const addNote = (subjectId: string) => {
    const note: Note = { id: newId("note"), courseId: subjectId, title: "", body: "" };
    setNotes((prev) => [note, ...prev]);
    setClosedGroups((prev) => {
      const next = new Set(prev);
      next.delete(subjectId);
      return next;
    });
    open(note.id);
  };

  const updateNote = (id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  };

  // Open the next note in the list in its place, or the previous one if it was last.
  const deleteNote = (id: string) => {
    const list = inListOrder(notes, subjects);
    const i = list.findIndex((n) => n.id === id);
    setNotes((prev) => prev.filter((n) => n.id !== id));
    open((list[i + 1] ?? list[i - 1])?.id ?? null);
  };

  const groups = groupNotes(notes, subjects);
  const active = notes.find((n) => n.id === activeId);

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
              const expanded = !closedGroups.has(group.id);
              return (
                <div key={group.id} className="notes-group">
                  <div className="notes-group-header">
                    <h2 className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => toggleGroup(group.id)}
                        aria-expanded={expanded}
                        aria-controls={`notes-group-${group.id}`}
                        className="flex w-full items-center gap-2 text-left text-xs font-semibold uppercase tracking-wide text-text-light transition-colors hover:text-text"
                      >
                        <ChevronIcon
                          dir="right"
                          className={`shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`}
                        />
                        <span className="min-w-0">{group.title}</span>
                        {!expanded && group.notes.length > 0 && (
                          <span className="ml-auto rounded-full bg-surface-muted px-2 text-text-muted">
                            {group.notes.length}
                            <span className="sr-only">{group.notes.length === 1 ? " note" : " notes"}</span>
                          </span>
                        )}
                      </button>
                    </h2>
                    {group.id !== OTHER && (
                      <button
                        type="button"
                        onClick={() => addNote(group.id)}
                        aria-label={`New note in ${group.title}`}
                        title="New note"
                        className={ICON_BUTTON}
                      >
                        <PlusIcon />
                      </button>
                    )}
                  </div>

                  <div id={`notes-group-${group.id}`} hidden={!expanded}>
                    {group.notes.length === 0 ? (
                      <p className="notes-group-empty">No notes yet</p>
                    ) : (
                      group.notes.map((note) => (
                        <button
                          key={note.id}
                          type="button"
                          className={`note-item${note.id === activeId ? " active" : ""}`}
                          onClick={() => open(note.id)}
                        >
                          <div className="note-item-title">{note.title || "Untitled"}</div>
                          <p className="note-item-preview">
                            {note.body.trim().split("\n")[0] || "No text yet"}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </aside>

        <section className="note-editor">
          {active ? (
            <>
              <div className="note-editor-toolbar">
                {confirmDelete ? (
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="text-sm text-text">Delete this note?</span>
                    <button
                      type="button"
                      onClick={() => deleteNote(active.id)}
                      className="rounded-md bg-error px-3 py-1.5 text-sm font-medium text-white hover:bg-error/90"
                    >
                      Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="rounded-md px-3 py-1.5 text-sm font-medium text-text-muted hover:bg-surface-muted hover:text-text"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="rounded-md px-2 py-1.5 text-sm font-medium text-error hover:bg-error/10"
                  >
                    Delete note
                  </button>
                )}
              </div>

              {/* Keyed per note so a new, empty note opens with the cursor in its title. */}
              <input
                key={active.id}
                className="note-editor-title"
                value={active.title}
                onChange={(e) => updateNote(active.id, { title: e.target.value })}
                placeholder="Untitled"
                aria-label="Note title"
                autoFocus={!active.title && !active.body}
              />
              <textarea
                className="note-editor-body"
                value={active.body}
                onChange={(e) => updateNote(active.id, { body: e.target.value })}
                placeholder="Start typing your notes…"
                aria-label="Note content"
              />
            </>
          ) : (
            <p className="text-text-muted">
              {notes.length > 0
                ? "Select a note to see it here."
                : subjects.length > 0
                  ? "No notes yet. Add one with + next to a subject."
                  : "No notes yet."}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
