import "server-only";
import { generateNotes } from "@/lib/ai/generate-notes";
import { weekItems, weekRows } from "@/lib/canvas/week";
import type { LearningProfile } from "@/lib/user/learning-profile";
import type { CourseRow } from "@/lib/supabase/types";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { NoteDto } from "@/lib/notes/types";
import { canvasClientFor } from "./canvas-connection";
import { registerFiles, storedFiles } from "./canvas-files";
import { createNote, NotesError } from "./notes";
import { dbError } from "./db-error";
import type { CurrentUser } from "./user";
import { saveWeekContent, storedWeekContent } from "./week-content";
import { weekModules } from "./week-modules";
import { parseLearningProfile, parseWeekRef } from "./week-review";

type CourseFields = Pick<CourseRow, "id" | "course_code" | "name" | "external_course_id">;
const CONTENT_FRESH_FOR_MS = 15 * 60 * 1000;

export interface GenerateNoteInput {
  courseId: string;
  week: number;
  learningProfile: LearningProfile | null;
}

export function parseGenerateNoteInput(body: unknown): GenerateNoteInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  return {
    ...parseWeekRef(raw.courseId, raw.week),
    learningProfile: parseLearningProfile(raw.learningProfile),
  };
}

export async function generateWeekNote(
  user: Pick<CurrentUser, "id" | "timezone">,
  input: GenerateNoteInput,
): Promise<NoteDto> {
  const userId = user.id;
  const [course, group] = await Promise.all([
    ownCourse(userId, input.courseId),
    weekModules(input.courseId, input.week),
  ]);
  if (!group) throw new NotesError("That week isn't synced yet. Sync the subject from Settings first.", 404);
  const moduleIds = group.modules.map((module) => module.id);

  // Subject sync stores the course outline, assessments and file queue. Pull the
  // selected week's actual pages/items when the cache is missing or old. A
  // recent generation can reuse the saved content and avoid several Canvas
  // requests before the AI call.
  let stored = await storedWeekContent(input.courseId, moduleIds);
  let refreshError: string | null = null;
  let canvasConnected: boolean | null = null;
  if (!isFresh(stored.updatedAt)) {
    const client = await canvasClientFor(userId);
    canvasConnected = client !== null;
    if (client) {
      try {
        const fetched = await weekItems(client, course.external_course_id, input.week, user.timezone);
        await registerFiles(input.courseId, fetched.files);
        const texts = await storedFiles(input.courseId, fetched.files.map((file) => file.id));
        await saveWeekContent(input.courseId, group.canonical.id, weekRows(fetched, texts));
        stored = await storedWeekContent(input.courseId, moduleIds);
      } catch (error) {
        refreshError = error instanceof Error ? error.message : String(error);
        console.error(
          `Week fetch failed for course ${course.external_course_id}, week ${input.week}: ${refreshError}`,
        );
      }
    }
  }

  if (!stored.markdown) {
    if (canvasConnected === false) {
      throw new NotesError("Canvas isn't connected. Save your Canvas URL and access token in Settings first.", 400);
    }
    if (refreshError) {
      throw new NotesError(`Couldn't load this week's Canvas content: ${refreshError}`, 502);
    }
    throw new NotesError(
      "Canvas did not return any readable pages, files, discussions, quizzes or assessments for this week.",
      404,
    );
  }

  const generated = await generateNotes({
    subject: [course.course_code, course.name].filter(Boolean).join(" "),
    week: input.week,
    weekTitle: group.title,
    weekContent: stored.markdown,
    learningProfile: input.learningProfile,
  });

  return createNote(userId, {
    courseId: input.courseId,
    moduleId: group.canonical.id,
    title: generated.title,
    content: generated.content,
  });
}

function isFresh(updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const updated = Date.parse(updatedAt);
  return Number.isFinite(updated) && Date.now() - updated < CONTENT_FRESH_FOR_MS;
}

async function ownCourse(userId: string, courseId: string): Promise<CourseFields> {
  const { data, error } = await supabaseAdmin()
    .from("course_enrolments")
    .select("courses(id, course_code, name, external_course_id)")
    .eq("user_id", userId)
    .eq("course_id", courseId)
    .eq("status", "active")
    .overrideTypes<{ courses: CourseFields | null }[], { merge: false }>();
  if (error) throw dbError("Couldn't check your subject", error);
  const course = data[0]?.courses;
  if (!course) throw new NotesError("That subject isn't one of yours.", 404);
  return course;
}
