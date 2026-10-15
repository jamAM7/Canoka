import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type {
  AssignmentProgressStatus,
  AssignmentRow,
  CourseRow,
  StudentAssignmentProgressRow,
  StudyTaskRow,
  StudyTaskStatus,
} from "@/lib/supabase/types";
import type { CalendarEvent, Course, CourseColor, TaskStatus } from "@/types/calendar";

// The calendar and dashboard's data, from Supabase, for one student:
//   courses     <- course_enrolments (active) -> courses
//   assessments <- assignments in those courses, with a due date, status from
//                  student_assignment_progress
//   tasks       <- study_tasks in the student's study_plans (subtasks point
//                  at their assignment through assignment_id)
// Every query is scoped to the student here: the service role skips RLS.
// Classes come from the timetable subscription instead (lib/data/timetable).

const COLORS: CourseColor[] = ["blue", "violet", "emerald", "amber", "rose", "cyan"];
/** A task with a date but no start time is booked for this hour, in the student's timezone. */
const DEFAULT_TASK_HOUR = 9;
const DEFAULT_TASK_MINUTES = 30;

type CourseFields = Pick<CourseRow, "id" | "course_code" | "name">;

/** The student's active subjects, by code. Colours follow that order, so they stay put between visits. */
export async function getCourses(userId: string): Promise<Course[]> {
  const { data, error } = await supabaseAdmin()
    .from("course_enrolments")
    .select("courses(id, course_code, name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .overrideTypes<{ courses: CourseFields | null }[], { merge: false }>();
  if (error) throw new Error(`Couldn't load your subjects: ${error.message}`);

  return data
    .flatMap((row) => (row.courses ? [row.courses] : []))
    .sort((a, b) => (a.course_code ?? a.name).localeCompare(b.course_code ?? b.name))
    .map((c, i) => ({ id: c.id, code: c.course_code ?? "", name: c.name, color: COLORS[i % COLORS.length] }));
}

/** Assessments and study tasks for these courses (from getCourses) and this student. */
export async function getCalendarEvents(userId: string, courseIds: string[], timezone: string): Promise<CalendarEvent[]> {
  const [assessments, tasks] = await Promise.all([
    getAssessments(userId, courseIds),
    getStudyTasks(userId, courseIds, timezone),
  ]);
  const assessmentIds = new Set(assessments.map((a) => a.id));
  // A subtask whose assignment isn't shown would point at nothing.
  for (const task of tasks) if (task.parentId && !assessmentIds.has(task.parentId)) task.parentId = undefined;
  return [...assessments, ...tasks];
}

type AssignmentFields = Pick<AssignmentRow, "id" | "course_id" | "name" | "description" | "due_at">;

async function getAssessments(userId: string, courseIds: string[]): Promise<CalendarEvent[]> {
  if (courseIds.length === 0) return [];
  const db = supabaseAdmin();
  // Without a due date an assessment has no place on a calendar.
  const { data: rows, error } = await db
    .from("assignments")
    .select("id, course_id, name, description, due_at")
    .in("course_id", courseIds)
    .not("due_at", "is", null)
    .overrideTypes<AssignmentFields[], { merge: false }>();
  if (error) throw new Error(`Couldn't load assessments: ${error.message}`);
  if (rows.length === 0) return [];

  const { data: progress, error: progressError } = await db
    .from("student_assignment_progress")
    .select("assignment_id, status")
    .eq("user_id", userId)
    .in(
      "assignment_id",
      rows.map((r) => r.id),
    )
    .overrideTypes<Pick<StudentAssignmentProgressRow, "assignment_id" | "status">[], { merge: false }>();
  if (progressError) throw new Error(`Couldn't load assessment progress: ${progressError.message}`);
  const statusById = new Map(progress.map((p) => [p.assignment_id, p.status]));

  return rows.map((a) => {
    const due = a.due_at as string;
    return {
      id: a.id,
      title: a.name,
      type: "assessment",
      // Canvas has a deadline, not a time to work on it, so the block sits on the deadline.
      start: due,
      end: due,
      dueDate: due,
      courseId: a.course_id,
      status: assessmentStatus(statusById.get(a.id)),
    };
  });
}

type TaskFields = Pick<
  StudyTaskRow,
  | "id"
  | "course_id"
  | "assignment_id"
  | "title"
  | "description"
  | "scheduled_date"
  | "scheduled_start"
  | "estimated_minutes"
  | "status"
>;

async function getStudyTasks(userId: string, courseIds: string[], timezone: string): Promise<CalendarEvent[]> {
  const db = supabaseAdmin();
  const { data: plans, error: planError } = await db
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .neq("status", "archived")
    .overrideTypes<{ id: string }[], { merge: false }>();
  if (planError) throw new Error(`Couldn't load study plans: ${planError.message}`);
  if (plans.length === 0) return [];

  const { data: rows, error } = await db
    .from("study_tasks")
    .select(
      "id, course_id, assignment_id, title, description, scheduled_date, scheduled_start, estimated_minutes, status",
    )
    .in(
      "study_plan_id",
      plans.map((p) => p.id),
    )
    .order("order_index", { ascending: true, nullsFirst: false })
    .overrideTypes<TaskFields[], { merge: false }>();
  if (error) throw new Error(`Couldn't load study tasks: ${error.message}`);

  const enrolled = new Set(courseIds);
  return rows.flatMap((t): CalendarEvent[] => {
    // A task for a subject the student has left, or with no date at all, isn't shown.
    if (t.course_id && !enrolled.has(t.course_id)) return [];
    const start =
      t.scheduled_start ?? (t.scheduled_date ? zonedIso(t.scheduled_date, DEFAULT_TASK_HOUR, timezone) : null);
    if (!start) return [];
    const minutes = t.estimated_minutes ?? DEFAULT_TASK_MINUTES;
    return [
      {
        id: t.id,
        title: t.title,
        type: "task",
        start,
        end: new Date(new Date(start).getTime() + minutes * 60_000).toISOString(),
        courseId: t.course_id ?? undefined,
        notes: t.description ?? undefined,
        status: taskStatus(t.status),
        parentId: t.assignment_id ?? undefined,
      },
    ];
  });
}

function assessmentStatus(status: AssignmentProgressStatus | undefined): TaskStatus {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "completed":
    case "submitted":
    case "graded":
      return "done";
    default:
      return "todo";
  }
}

function taskStatus(status: StudyTaskStatus): TaskStatus {
  switch (status) {
    case "in_progress":
      return "in_progress";
    case "completed":
      return "done";
    // Skipped tasks go back to the start of the board rather than vanishing.
    case "skipped":
      return "coming_up";
    default:
      return "todo";
  }
}

/** `date` ("YYYY-MM-DD") at `hour`:`minute` in `timezone`, as an ISO instant. */
export function zonedIso(date: string, hour: number, timezone: string, minute = 0): string | null {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) return null;
  const guess = Date.UTC(y, m - 1, d, hour, minute);
  // The zone's offset at that moment: format the instant there, read it back as UTC.
  let parts: Record<string, string>;
  try {
    parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        hourCycle: "h23",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(guess)
        .map((p) => [p.type, p.value]),
    );
  } catch {
    return new Date(guess).toISOString();
  }
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return new Date(guess - (local - guess)).toISOString();
}
