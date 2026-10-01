import type { JSONContent } from "@tiptap/core";

// What the notes API and the Notes page pass between them. No server imports,
// so both can use it.

/** A note's text as the editor (TipTap) saves it. This is what `notes.content` holds. */
export type NoteDoc = JSONContent;

export const EMPTY_DOC: NoteDoc = { type: "doc", content: [] };

export interface NoteWeek {
  /** The teaching week, from 1. */
  number: number;
  /** From the Canvas module named for the week, e.g. "Systems Thinking in Practice". */
  title: string | null;
  /** The week's course_modules row. Notes for the week set `module_id` to it. */
  moduleId: string;
}

export interface NotesSubject {
  /** courses.id */
  id: string;
  /** The Canvas course id (courses.external_course_id). */
  externalId: string;
  /** UTS subject code, e.g. "41052". */
  code: string | null;
  name: string;
  /** Every week of the session, from 1, in order. Empty until the subject has been synced. */
  weeks: NoteWeek[];
}

export interface NoteDto {
  id: string;
  /** courses.id */
  courseId: string;
  /** course_modules.id, normally one of the subject's weeks. */
  moduleId: string | null;
  /** The week `moduleId` is, or null for a module that isn't one of the subject's weeks. */
  week: number | null;
  title: string;
  content: NoteDoc;
  updatedAt: string;
}

export interface NotesOverview {
  subjects: NotesSubject[];
  /** The student's notes that aren't archived, newest edit first. */
  notes: NoteDto[];
}
