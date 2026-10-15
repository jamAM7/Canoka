import "server-only";
import type { SubjectRows } from "@/lib/canvas/subject";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dbError } from "./db-error";

// Puts a Canvas subject in the database so the app can list it by week:
// the institution, the course, the student's enrolment, every module (the
// Canvas ones, and a synthetic module for each teaching week Canvas has no
// module named for, see lib/notes/weeks and lib/canvas/subject), and the
// assessments. It writes no course_content:
// the AI review does that for the week it reviews.
//
// Every write is an upsert on the table's unique key, so syncing a subject
// twice changes nothing. The rows come from Canvas through lib/canvas/subject.

/** Rows per request, to stay well inside PostgREST's limits. */
const CHUNK = 200;

export interface SyncedSubject {
  /** courses.id */
  courseId: string;
  externalCourseId: string;
  code: string | null;
  name: string;
  /** Teaching weeks the subject has in all. */
  weeks: number;
  /** Canvas modules upserted. */
  modules: number;
  assignments: number;
  warnings: string[];
}

export async function syncSubject(userId: string, rows: SubjectRows): Promise<SyncedSubject> {
  const db = supabaseAdmin();
  const { course } = rows;

  const institutionId = await institutionFor(rows.canvas_host);

  // Columns Canvas has no value for are left out, so a re-sync never blanks what's already there.
  const courseRow: Record<string, unknown> = {
    institution_id: institutionId,
    lms_provider: "canvas",
    external_course_id: course.external_course_id,
    name: course.name,
  };
  for (const key of ["course_code", "term_name", "start_date", "end_date"] as const) {
    if (course[key]) courseRow[key] = course[key];
  }
  const { data: courseData, error: courseError } = await db
    .from("courses")
    .upsert(courseRow, { onConflict: "institution_id,external_course_id" })
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (courseError) throw dbError(`Couldn't save ${course.course_code ?? course.name}`, courseError);
  const courseId = courseData[0].id;

  // An existing enrolment is left as it is, whatever its status.
  const { error: enrolmentError } = await db
    .from("course_enrolments")
    .upsert({ user_id: userId, course_id: courseId }, { onConflict: "user_id,course_id", ignoreDuplicates: true });
  if (enrolmentError) throw dbError("Couldn't enrol you in the subject", enrolmentError);

  const moduleRows = [
    ...rows.modules.map((m) => ({ ...m, course_id: courseId })),
    // Synthetic, not from Canvas: a week with no Canvas module named for it. The week number is also its position.
    ...rows.weeks.map((w) => ({
      course_id: courseId,
      external_module_id: w.external_module_id,
      name: w.name,
      position: w.number,
      unlock_at: null,
      published: true,
    })),
  ];
  await upsertAll("course_modules", moduleRows, "course_id,external_module_id", "Couldn't save the weeks");

  const assignmentRows = rows.assessments.map((a) => ({ ...a, course_id: courseId }));
  await upsertAll("assignments", assignmentRows, "course_id,external_assignment_id", "Couldn't save the assessments");

  return {
    courseId,
    externalCourseId: course.external_course_id,
    code: course.course_code,
    name: course.name,
    weeks: rows.week_count,
    modules: rows.modules.length,
    assignments: rows.assessments.length,
    warnings: [],
  };
}

/** `https://Canvas.UTS.edu.au/` -> `https://canvas.uts.edu.au`, so one site is one institution. */
export function canvasOrigin(host: string | null | undefined): string | null {
  if (!host?.trim()) return null;
  try {
    return new URL(host.includes("://") ? host.trim() : `https://${host.trim()}`).origin;
  } catch {
    return null;
  }
}

/** The institution for a Canvas site, which is created if it isn't there. */
async function institutionFor(host: string | null): Promise<string> {
  const origin = canvasOrigin(host) ?? canvasOrigin(process.env.CANVAS_BASE_URL);
  if (!origin) throw new Error("The sync doesn't say which Canvas it read. Save your Canvas address in Settings.");

  const db = supabaseAdmin();
  const { data: all, error } = await db
    .from("institutions")
    .select("id, canvas_base_url")
    .overrideTypes<{ id: string; canvas_base_url: string | null }[], { merge: false }>();
  if (error) throw dbError("Couldn't load institutions", error);
  // Compared by origin, so a trailing slash or capital in the stored URL doesn't make a second one.
  const existing = all.find((i) => canvasOrigin(i.canvas_base_url) === origin);
  if (existing) return existing.id;

  const hostname = new URL(origin).hostname;
  const { data, error: insertError } = await db
    .from("institutions")
    .upsert({ name: hostname.endsWith("uts.edu.au") ? "UTS" : hostname, canvas_base_url: origin }, { onConflict: "canvas_base_url" })
    .select("id")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (insertError) throw dbError("Couldn't save the institution", insertError);
  return data[0].id;
}

async function upsertAll(table: string, rows: Record<string, unknown>[], onConflict: string, what: string) {
  const db = supabaseAdmin();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db.from(table).upsert(rows.slice(i, i + CHUNK), { onConflict });
    if (error) throw dbError(what, error);
  }
}
