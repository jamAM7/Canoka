import { readFile } from "node:fs/promises";
import path from "node:path";
import type { CalendarEvent, Course, CourseColor } from "@/types/calendar";

// The calendar's subjects and assessments, from the Canvas scraper's last run
// in scraper/out. Server-only, since it reads from disk: run the scraper on the
// machine serving the app. Swap for a query against `subjects` and
// `calendar_events` once /api/canvas/sync stores them in Supabase.
//
// Canvas has no timetable, so there are no classes here. Tasks are the
// student's own and are kept in the browser (lib/calendar/storage.ts).

export interface CalendarData {
  courses: Course[];
  events: CalendarEvent[];
}

const OUT = path.join(process.cwd(), "scraper", "out");
const INDEX = path.join(OUT, "index.json");
const COLORS: CourseColor[] = ["blue", "violet", "emerald", "amber", "rose", "cyan"];
/** Canvas submission states that mean the work is handed in. */
const HANDED_IN = new Set(["submitted", "graded", "pending_review"]);

interface IndexSubject {
  code?: string | null;
  name?: string;
  course_id?: string | number | null;
  file?: string;
}

interface Assessment {
  id: string | number;
  name: string;
  due_at?: string | null;
  published?: boolean;
  my_submission?: { workflow_state?: string } | null;
}

/** Subjects and assessments from the last scrape, or none if the scraper hasn't run here. */
export async function loadCalendarData(): Promise<CalendarData> {
  let raw: string;
  try {
    raw = await readFile(INDEX, "utf8");
  } catch {
    return { courses: [], events: [] };
  }

  let subjects: IndexSubject[];
  try {
    subjects = JSON.parse(raw).subjects;
    if (!Array.isArray(subjects)) throw new Error("it has no `subjects` list");
  } catch (error) {
    console.error(`Ignoring ${INDEX}:`, error);
    return { courses: [], events: [] };
  }

  // Sorted by code as on the Notes page, so each subject keeps its colour
  // between scrapes unless the subject list itself changes.
  const listed = subjects
    .filter((s) => s && s.course_id != null && typeof s.name === "string")
    .sort((a, b) => (a.code ?? a.name!).localeCompare(b.code ?? b.name!));

  const perSubject = await Promise.all(
    listed.map(async (s, i) => {
      // The Canvas course id, which is also what notes are saved against.
      const id = String(s.course_id);
      const course: Course = { id, code: s.code ?? s.name!, name: s.name!, color: COLORS[i % COLORS.length] };
      const assessments = (await readAssessments(s.file)).filter((a) => a.published !== false);
      return { course, events: assessments.map((a) => toEvent(a, id)) };
    }),
  );
  return {
    courses: perSubject.map((s) => s.course),
    events: perSubject.flatMap((s) => s.events),
  };
}

async function readAssessments(file: unknown): Promise<Assessment[]> {
  try {
    const document = JSON.parse(await readFile(path.join(OUT, String(file)), "utf8"));
    return Array.isArray(document.assessments) ? document.assessments : [];
  } catch {
    // No document beside the index: the subject, with nothing due.
    return [];
  }
}

function toEvent(assessment: Assessment, courseId: string): CalendarEvent {
  const due = assessment.due_at ?? undefined;
  const handedIn = HANDED_IN.has(assessment.my_submission?.workflow_state ?? "");
  return {
    // Stable across scrapes, so the student's edits stay with the assessment.
    id: `canvas-${assessment.id}`,
    title: assessment.name,
    type: "assessment",
    ...(due && { start: due, end: due, dueDate: due }),
    courseId,
    status: handedIn ? "done" : "coming_up",
  };
}
