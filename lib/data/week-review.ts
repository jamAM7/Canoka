import "server-only";
import { reviewNotes, type NotesReview } from "@/lib/ai/review";
import { weekItems, weekRows } from "@/lib/canvas/week";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CourseRow, NoteRow, WeekReviewRow } from "@/lib/supabase/types";
import { docText } from "@/lib/notes/text";
import type { WeekReviewDto } from "@/lib/notes/types";
import type { LearningProfile } from "@/lib/user/learning-profile";
import { canvasClientFor } from "./canvas-connection";
import { registerFiles, storedFiles } from "./canvas-files";
import { dbError } from "./db-error";
import { NotesError, isUuid } from "./notes";
import type { CurrentUser } from "./user";
import { saveWeekContent, storedWeekContent } from "./week-content";
import { weekModuleIds, weekModules } from "./week-modules";

// The AI review of a student's notes for one week of a subject.
//
//   1. check the request and the week's notes (cheap, before anything slow)
//   2. fetch the week from Canvas (lib/canvas/week), signed in with the
//      student's saved connection, add the text of its files that a sync has
//      read (lib/data/canvas-files), and save it all as course_content
//   3. read the week's notes and content back from the database
//   4. have Claude compare them, and save the result in week_reviews
//
// A week is read by (course_id, week_number), through every module for the
// week (lib/data/week-modules), so a leftover duplicate module can't hide half
// of it. If step 2 fails, or Canvas isn't connected, the review still runs on
// whatever course_content is already stored, and says so (`contentStale`).

const MAX_WEEK = 20;
const MAX_NOTES = 50;
const MAX_NOTE_CHARS = 200_000;
const REVIEW_COLUMNS =
  "id, user_id, course_id, module_id, content, model_name, note_count, had_course_content, content_stale, content_updated_at, created_at";
type CourseFields = Pick<CourseRow, "id" | "external_course_id" | "course_code" | "name">;

export interface WeekRef {
  courseId: string;
  week: number;
}

export interface ReviewInput extends WeekRef {
  /** Accepted for older clients. Nothing is cached any more: every review asks Canvas. */
  refresh: boolean;
  learningProfile: LearningProfile | null;
}

export interface ReviewOutcome {
  review: WeekReviewDto;
  /** Why the content may be out of date, when it may be. Not stored. */
  staleReason: string | null;
}

export function parseWeekRef(courseId: unknown, week: unknown): WeekRef {
  if (!isUuid(courseId)) throw new NotesError("Choose a subject.", 400);
  const number = typeof week === "string" && week.trim() !== "" ? Number(week) : week;
  if (typeof number !== "number" || !Number.isInteger(number) || number < 1 || number > MAX_WEEK) {
    throw new NotesError(`Choose a week from 1 to ${MAX_WEEK}.`, 400);
  }
  return { courseId, week: number };
}

export function parseReviewInput(body: unknown): ReviewInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  // A JSON body says what type it means: the week is a number. (A query string can only say "3".)
  if (typeof raw.week !== "number") throw new NotesError(`Choose a week from 1 to ${MAX_WEEK}.`, 400);
  return {
    ...parseWeekRef(raw.courseId, raw.week),
    refresh: raw.refresh === true,
    learningProfile: parseLearningProfile(raw.learningProfile),
  };
}

export function parseLearningProfile(value: unknown): LearningProfile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const profile = value as Record<string, unknown>;
  const oneOf = (candidate: unknown, allowed: string[]) =>
    typeof candidate === "string" && allowed.includes(candidate) ? candidate : null;
  const allowedModes = new Set(["examples", "visual", "explanations", "practice"]);
  return {
    studyLevel: oneOf(profile.studyLevel, ["high-school", "undergraduate", "postgraduate", "other"]),
    studyGoal: oneOf(profile.studyGoal, ["understand", "exams", "assignments", "keep-up"]),
    learningModes: (Array.isArray(profile.learningModes) ? profile.learningModes : [])
      .filter((mode): mode is string => typeof mode === "string" && allowedModes.has(mode))
      .slice(0, 4),
    noteDepth: oneOf(profile.noteDepth, ["concise", "balanced", "detailed"]),
    supportStyle: oneOf(profile.supportStyle, ["guided", "questions", "direct"]),
  };
}

// One review per student and week at a time: they take a while, and a second click shouldn't pay for another.
const store = globalThis as typeof globalThis & { canokaReviewing?: Set<string> };
const reviewing = (store.canokaReviewing ??= new Set<string>());

export async function reviewWeek(user: Pick<CurrentUser, "id" | "timezone">, input: ReviewInput): Promise<ReviewOutcome> {
  const { courseId, week } = input;
  const userId = user.id;
  const course = await ownCourse(userId, courseId);

  const group = await weekModules(courseId, week);
  if (!group) throw new NotesError("That week isn't in the database yet. Sync the subject from Settings first.", 404);
  const moduleIds = group.modules.map((m) => m.id);

  const notes = await weekNotes(userId, courseId, moduleIds);
  if (notes.length === 0) throw new NotesError("Write some notes for this week first.", 400);

  const lock = `${userId}:${courseId}:${week}`;
  if (reviewing.has(lock)) throw new NotesError("A review of this week is already running.", 409);
  reviewing.add(lock);
  try {
    // Step 2. If Canvas or the save fails, review against what's already stored.
    let staleReason: string | null = null;
    try {
      const client = await canvasClientFor(userId);
      if (client) {
        const fetched = await weekItems(client, course.external_course_id, week, user.timezone);
        // A file found here for the first time is read by the next sync.
        await registerFiles(courseId, fetched.files);
        const texts = await storedFiles(courseId, fetched.files.map((f) => f.id));
        await saveWeekContent(courseId, group.canonical.id, weekRows(fetched, texts));
      } else {
        staleReason = "Canvas isn't connected, so this used the content saved earlier. Connect it in Settings.";
      }
    } catch (error) {
      staleReason = error instanceof Error ? error.message : String(error);
      console.error(`Week fetch failed for course ${course.external_course_id}, week ${week}: ${staleReason}`);
    }

    // Step 3.
    const content = await storedWeekContent(courseId, moduleIds);

    // Step 4.
    const { review, model } = await reviewNotes({
      subject: [course.course_code, course.name].filter(Boolean).join(" "),
      week,
      weekTitle: group.title,
      weekContent: content.markdown,
      notes,
      learningProfile: input.learningProfile,
    });
    const saved = await saveReview(userId, {
      courseId,
      moduleId: group.canonical.id,
      review,
      model,
      noteCount: notes.length,
      hadCourseContent: content.markdown !== null,
      contentStale: staleReason !== null,
      contentUpdatedAt: content.updatedAt,
    });
    return { review: toDto(saved, week), staleReason };
  } finally {
    reviewing.delete(lock);
  }
}

/** The week's latest stored review, from any of its modules, or null if it hasn't been reviewed. */
export async function latestWeekReview(userId: string, ref: WeekRef): Promise<WeekReviewDto | null> {
  const moduleIds = await weekModuleIds(ref.courseId, ref.week);
  if (moduleIds.length === 0) return null;
  const { data, error } = await supabaseAdmin()
    .from("week_reviews")
    .select(REVIEW_COLUMNS)
    .eq("user_id", userId)
    .eq("course_id", ref.courseId)
    .in("module_id", moduleIds)
    .order("created_at", { ascending: false })
    .limit(1)
    .overrideTypes<WeekReviewRow[], { merge: false }>();
  if (error) throw dbError("Couldn't load the review", error);
  return data[0] ? toDto(data[0], ref.week) : null;
}

// ---------------------------------------------------------------- helpers

async function ownCourse(userId: string, courseId: string): Promise<CourseFields> {
  const { data, error } = await supabaseAdmin()
    .from("course_enrolments")
    .select("courses(id, external_course_id, course_code, name)")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("status", "active")
    .overrideTypes<{ courses: CourseFields | null }[], { merge: false }>();
  if (error) throw dbError("Couldn't check your subject", error);
  const course = data[0]?.courses;
  if (!course) throw new NotesError("That subject isn't one of yours.", 404);
  return course;
}

/** The week's notes with text, oldest first: every note under any module for the week. */
async function weekNotes(userId: string, courseId: string, moduleIds: string[]): Promise<{ title: string; content: string }[]> {
  const { data, error } = await supabaseAdmin()
    .from("notes")
    .select("title, content, plain_text")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("is_archived", false)
    .in("module_id", moduleIds)
    .order("created_at", { ascending: true })
    .overrideTypes<Pick<NoteRow, "title" | "content" | "plain_text">[], { merge: false }>();
  if (error) throw dbError("Couldn't load your notes", error);
  return data
    .map((n) => ({ title: n.title, content: (n.plain_text ?? docText(n.content)).slice(0, MAX_NOTE_CHARS) }))
    .filter((n) => n.content.trim() !== "")
    .slice(0, MAX_NOTES);
}

async function saveReview(
  userId: string,
  r: {
    courseId: string;
    moduleId: string;
    review: NotesReview;
    model: string;
    noteCount: number;
    hadCourseContent: boolean;
    contentStale: boolean;
    contentUpdatedAt: string | null;
  },
): Promise<WeekReviewRow> {
  const { data, error } = await supabaseAdmin()
    .from("week_reviews")
    .insert({
      user_id: userId,
      course_id: r.courseId,
      module_id: r.moduleId,
      content: r.review,
      model_name: r.model,
      note_count: r.noteCount,
      had_course_content: r.hadCourseContent,
      content_stale: r.contentStale,
      content_updated_at: r.contentUpdatedAt,
    })
    .select(REVIEW_COLUMNS)
    .overrideTypes<WeekReviewRow[], { merge: false }>();
  if (error) throw dbError("Couldn't save the review", error);
  return data[0];
}

function toDto(row: WeekReviewRow, week: number): WeekReviewDto {
  return {
    id: row.id,
    createdAt: row.created_at,
    courseId: row.course_id,
    moduleId: row.module_id,
    week,
    modelName: row.model_name,
    noteCount: row.note_count,
    hadCourseContent: row.had_course_content,
    contentStale: row.content_stale,
    contentUpdatedAt: row.content_updated_at,
    content: row.content as NotesReview,
  };
}
