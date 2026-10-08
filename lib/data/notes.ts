import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CourseModuleRow, CourseRow, NoteRow } from "@/lib/supabase/types";
import { docText } from "@/lib/notes/text";
import { EMPTY_DOC, type NoteDoc, type NoteDto, type NotesOverview, type NotesSubject } from "@/lib/notes/types";
import { groupWeeks, weekOfModule as weekNumberOf, type WeekModule } from "@/lib/notes/weeks";
import { dbError } from "./db-error";

// The student's notes, by subject (a course) and week (a course_module).
// Every function takes the student's public.users.id and scopes each query to
// it: the service role skips RLS, so nothing else would.
//
// A note's `content` is a TipTap document and `plain_text` its words, worked
// out here so the two can't disagree. Saving a note changes content and
// plain_text, which the trg_snapshot_note_version trigger records in
// note_versions: don't write that table from here.

/** A request the student can fix, with the HTTP status to answer it with. */
export class NotesError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_TITLE = 300;
/** Characters of JSON in one note. Far beyond typed notes, but short of a request that exhausts memory. */
const MAX_DOC_CHARS = 1_000_000;

const NOTE_COLUMNS = "id, course_id, module_id, title, content, updated_at";
type NoteFields = Pick<NoteRow, "id" | "course_id" | "module_id" | "title" | "content" | "updated_at">;
type CourseFields = Pick<CourseRow, "id" | "external_course_id" | "course_code" | "name">;
type ModuleFields = WeekModule & Pick<CourseModuleRow, "course_id">;

// ---------------------------------------------------------------- reading

/** The student's active subjects with their weeks, and their notes that aren't archived. */
export async function getNotesOverview(userId: string): Promise<NotesOverview> {
  const db = supabaseAdmin();

  const { data: enrolments, error } = await db
    .from("course_enrolments")
    .select("courses(id, external_course_id, course_code, name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .overrideTypes<{ courses: CourseFields | null }[], { merge: false }>();
  if (error) throw dbError("Couldn't load your subjects", error);
  const courses = enrolments
    .flatMap((row) => (row.courses ? [row.courses] : []))
    .sort((a, b) => (a.course_code ?? a.name).localeCompare(b.course_code ?? b.name));
  if (courses.length === 0) return { subjects: [], notes: [] };
  const courseIds = courses.map((c) => c.id);

  const { data: modules, error: moduleError } = await db
    .from("course_modules")
    .select("id, course_id, external_module_id, name, position, week_number, created_at")
    .in("course_id", courseIds)
    .order("position", { ascending: true, nullsFirst: false })
    .overrideTypes<ModuleFields[], { merge: false }>();
  if (moduleError) throw dbError("Couldn't load your subjects' weeks", moduleError);

  const { data: rows, error: noteError } = await db
    .from("notes")
    .select(NOTE_COLUMNS)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .in("course_id", courseIds)
    .order("updated_at", { ascending: false })
    .overrideTypes<NoteFields[], { merge: false }>();
  if (noteError) throw dbError("Couldn't load your notes", noteError);

  const weekByModule = new Map<string, number>();
  const subjects: NotesSubject[] = courses.map((course) => {
    // Each week once, under its canonical module (lib/notes/weeks). A note under any
    // module for the week still belongs to it, so a leftover duplicate can't hide notes.
    const groups = groupWeeks(modules.filter((m) => m.course_id === course.id));
    for (const group of Array.from(groups.values())) {
      for (const m of group.modules) weekByModule.set(m.id, group.number);
    }
    return {
      id: course.id,
      externalId: course.external_course_id,
      code: course.course_code,
      name: course.name,
      weeks: Array.from(groups.values(), (g) => ({ number: g.number, title: g.title, moduleId: g.canonical.id })),
    };
  });

  return { subjects, notes: rows.map((row) => toDto(row, row.module_id ? (weekByModule.get(row.module_id) ?? null) : null)) };
}

// ---------------------------------------------------------------- writing

export interface NewNote {
  courseId: string;
  moduleId: string;
  title: string;
  content: NoteDoc;
}

export interface NotePatch {
  title?: string;
  content?: NoteDoc;
  moduleId?: string;
}

/** Checks a POST body. Every note belongs to a week, so `moduleId` is required. */
export function parseNewNote(body: unknown): NewNote {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (!isUuid(raw.courseId)) throw new NotesError("Choose a subject for the note.", 400);
  if (!isUuid(raw.moduleId)) throw new NotesError("Choose a week for the note.", 400);
  return {
    courseId: raw.courseId,
    moduleId: raw.moduleId,
    title: raw.title === undefined ? "" : parseTitle(raw.title),
    content: raw.content === undefined ? EMPTY_DOC : parseDoc(raw.content),
  };
}

/** Checks a PATCH body. Only these three fields can change. */
export function parseNotePatch(body: unknown): NotePatch {
  const raw = (body ?? {}) as Record<string, unknown>;
  const patch: NotePatch = {};
  if (raw.title !== undefined) patch.title = parseTitle(raw.title);
  if (raw.content !== undefined) patch.content = parseDoc(raw.content);
  if (raw.moduleId !== undefined) {
    if (!isUuid(raw.moduleId)) throw new NotesError("Choose a week for the note.", 400);
    patch.moduleId = raw.moduleId;
  }
  if (Object.keys(patch).length === 0) throw new NotesError("Nothing to change.", 400);
  return patch;
}

export async function createNote(userId: string, input: NewNote): Promise<NoteDto> {
  await assertEnrolled(userId, input.courseId);
  const week = await weekOfCourseModule(input.courseId, input.moduleId);

  const { data, error } = await supabaseAdmin()
    .from("notes")
    .insert({
      user_id: userId,
      course_id: input.courseId,
      module_id: input.moduleId,
      title: input.title,
      content: input.content,
      plain_text: docText(input.content),
    })
    .select(NOTE_COLUMNS)
    .overrideTypes<NoteFields[], { merge: false }>();
  if (error) throw dbError("Couldn't save the note", error);
  return toDto(data[0], week);
}

export async function updateNote(userId: string, id: string, patch: NotePatch): Promise<NoteDto> {
  const db = supabaseAdmin();
  const current = await ownNote(userId, id);

  const values: Record<string, unknown> = {};
  if (patch.title !== undefined) values.title = patch.title;
  if (patch.content !== undefined) {
    values.content = patch.content;
    values.plain_text = docText(patch.content);
  }
  const moduleId = patch.moduleId ?? current.module_id;
  // Moving to a week checks the week is the note's own subject's.
  const week = moduleId ? await weekOfCourseModule(current.course_id, moduleId) : null;
  if (patch.moduleId !== undefined) values.module_id = patch.moduleId;

  const { data, error } = await db
    .from("notes")
    .update(values)
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .select(NOTE_COLUMNS)
    .overrideTypes<NoteFields[], { merge: false }>();
  if (error) throw dbError("Couldn't save the note", error);
  if (data.length === 0) throw new NotesError("That note no longer exists.", 404);
  return toDto(data[0], week);
}

/** Notes are archived, never deleted: is_archived hides them, and their history stays. */
export async function archiveNote(userId: string, id: string): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("notes")
    .update({ is_archived: true })
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (error) throw dbError("Couldn't delete the note", error);
  if (data.length === 0) throw new NotesError("That note no longer exists.", 404);
}

// ---------------------------------------------------------------- helpers

export const isUuid = (value: unknown): value is string => typeof value === "string" && UUID.test(value);

function parseTitle(value: unknown): string {
  if (typeof value !== "string") throw new NotesError("A note's title is text.", 400);
  return value.slice(0, MAX_TITLE);
}

function parseDoc(value: unknown): NoteDoc {
  const doc = value as { type?: unknown; content?: unknown } | null;
  if (!doc || typeof doc !== "object" || doc.type !== "doc" || (doc.content !== undefined && !Array.isArray(doc.content))) {
    throw new NotesError("A note's content must be an editor document.", 400);
  }
  if (JSON.stringify(doc).length > MAX_DOC_CHARS) throw new NotesError("That note is too long to save.", 413);
  return doc as NoteDoc;
}

function toDto(row: NoteFields, week: number | null): NoteDto {
  return {
    id: row.id,
    courseId: row.course_id,
    moduleId: row.module_id,
    week,
    title: row.title,
    content: row.content as NoteDoc,
    updatedAt: row.updated_at,
  };
}

async function assertEnrolled(userId: string, courseId: string): Promise<void> {
  const { data, error } = await supabaseAdmin()
    .from("course_enrolments")
    .select("id")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("status", "active")
    .limit(1)
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (error) throw dbError("Couldn't check your subject", error);
  if (data.length === 0) throw new NotesError("That subject isn't one of yours.", 404);
}

/** The week a module is for (null if it's not a week's), checking it belongs to the course. */
async function weekOfCourseModule(courseId: string, moduleId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin()
    .from("course_modules")
    .select("external_module_id, week_number")
    .eq("id", moduleId)
    .eq("course_id", courseId)
    .overrideTypes<Pick<WeekModule, "external_module_id" | "week_number">[], { merge: false }>();
  if (error) throw dbError("Couldn't check the week", error);
  if (data.length === 0) throw new NotesError("That week isn't part of this subject.", 404);
  return weekNumberOf(data[0]);
}

async function ownNote(userId: string, id: string): Promise<{ course_id: string; module_id: string | null }> {
  const { data, error } = await supabaseAdmin()
    .from("notes")
    .select("course_id, module_id")
    .eq("id", id)
    .eq("user_id", userId)
    .eq("is_archived", false)
    .overrideTypes<{ course_id: string; module_id: string | null }[], { merge: false }>();
  if (error) throw dbError("Couldn't load the note", error);
  if (data.length === 0) throw new NotesError("That note no longer exists.", 404);
  return data[0];
}
