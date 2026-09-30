"use client";

import { useEffect, useState } from "react";
import type { Course } from "@/types/calendar";
import { loadNotes, saveNotes, type Note, type SavedNotes } from "@/lib/notes/storage";

interface Props {
  courses: Course[];
}

// Notes view: course list on the left, the selected course's note on the right.
// TODO: load real notes from `subjects` + `notes` and save edits back.
export function NotesContent({ courses }: Props) {
  const [activeId, setActiveId] = useState(courses[0]?.id);
  const [notes, setNotes] = useState<SavedNotes>({});
  const [loaded, setLoaded] = useState(false);

  // Read saved notes after mount so server and client render the same markup.
  useEffect(() => {
    setNotes(loadNotes() ?? {});
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (loaded) saveNotes(notes);
  }, [notes, loaded]);

  const noteFor = (course: Course): Note =>
    notes[course.id] ?? { title: course.name, body: "" };

  const updateNote = (id: string, patch: Partial<Note>) => {
    const course = courses.find((c) => c.id === id);
    if (!course) return;
    setNotes((prev) => ({ ...prev, [id]: { ...noteFor(course), ...prev[id], ...patch } }));
  };

  const active = courses.find((c) => c.id === activeId);
  const activeNote = active && noteFor(active);

  return (
    <div className="space-y-6 p-8 md:p-10">
      <header className="px-2 pt-2">
        <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">Notes</h1>
        <p className="mt-1 text-sm text-text-muted">
          AI-generated notes for each subject and week, built from your Canvas content.
        </p>
      </header>

      <div className="notes-layout">
        <aside className="notes-list">
          {courses.map((course) => {
            const note = noteFor(course);
            return (
              <button
                key={course.id}
                type="button"
                className={`note-item${course.id === activeId ? " active" : ""}`}
                onClick={() => setActiveId(course.id)}
              >
                <div className="note-item-title">{note.title || course.name}</div>
                <p className="note-item-preview">
                  {note.body.trim().split("\n")[0] || course.code}
                </p>
              </button>
            );
          })}
        </aside>

        <section className="note-editor">
          {active && activeNote ? (
            <>
              <input
                className="note-editor-title"
                value={activeNote.title}
                onChange={(e) => updateNote(active.id, { title: e.target.value })}
                placeholder="Untitled"
                aria-label="Note title"
              />
              <textarea
                className="note-editor-body"
                value={activeNote.body}
                onChange={(e) => updateNote(active.id, { body: e.target.value })}
                placeholder="Start typing your notes…"
                aria-label="Note content"
              />
            </>
          ) : (
            <p className="text-text-muted">Select a subject to see its notes.</p>
          )}
        </section>
      </div>
    </div>
  );
}
