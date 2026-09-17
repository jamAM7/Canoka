// lib/supabase/study-tasks.ts
import { createClient } from "@/lib/supabase/server"; // or your existing client helper
import type { CalendarEvent, Course, CourseColor, TaskStatus } from "@/types/calendar";

const COURSE_COLORS: CourseColor[] = ["blue", "violet", "emerald", "amber", "rose", "cyan"];

function colorForCourse(courseId: string): CourseColor {
  // Stable hash so the same course always gets the same color across reloads.
  let hash = 0;
  for (const char of courseId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return COURSE_COLORS[hash % COURSE_COLORS.length];
}

function mapTaskStatus(dbStatus: string): TaskStatus {
  switch (dbStatus) {
    case "pending":
      return "todo";
    case "in_progress":
      return "in_progress";
    case "completed":
      return "done";
    case "skipped":
      return "coming_up"; // adjust if you'd rather filter these out entirely
    default:
      return "todo";
  }
}

export async function getCoursesForUser(userId: string): Promise<Course[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("course_enrolments")
    .select("courses(id, course_code, name)")
    .eq("user_id", userId);

  if (error) throw error;

  return (data ?? [])
  .flatMap((row) => row.courses ?? [])
  .filter((c): c is NonNullable<typeof c> => !!c)
  .map((c) => ({
    id: c.id,
    code: c.course_code ?? "",
    name: c.name,
    color: colorForCourse(c.id),
  }));
}

export async function getCalendarEventsForUser(userId: string): Promise<CalendarEvent[]> {
  const supabase = await createClient();

  // Assignments the student is enrolled in, via course_enrolments.
  const { data: assignmentRows, error: assignmentError } = await supabase
    .from("assignments")
    .select("id, course_id, name, due_at, points_possible, weight, courses!inner(id, course_enrolments!inner(user_id))")
    .eq("courses.course_enrolments.user_id", userId);

  if (assignmentError) throw assignmentError;

  const assessmentEvents: CalendarEvent[] = (assignmentRows ?? []).map((a) => ({
    id: a.id,
    title: a.name,
    type: "assessment",
    start: a.due_at ?? new Date().toISOString(),
    end: a.due_at ?? new Date().toISOString(),
    courseId: a.course_id,
    status: "todo", // assessments don't track their own status column yet — see note below
    dueDate: a.due_at ?? undefined,
  }));

  // Study tasks (subtasks), linked to their assignment via assignment_id.
//   const { data: taskRows, error: taskError } = await supabase
//     .from("study_tasks")
//     .select("id, course_id, assignment_id, title, description, scheduled_start, estimated_minutes, status, study_plans!inner(user_id)")
//     .eq("study_plans.user_id", userId);
    const { data: taskRows, error: taskError } = await supabase
    .from("study_tasks")
    .select("id, course_id, assignment_id, title, description, scheduled_start, estimated_minutes, status, study_plan_id");

    console.log("ALL taskRows (no filter):", JSON.stringify(taskRows, null, 2));

  if (taskError) throw taskError;

  console.log("taskRows:", JSON.stringify(taskRows, null, 2));
  console.log("taskError:", taskError);

  const taskEvents: CalendarEvent[] = (taskRows ?? []).map((t) => {
    const start = t.scheduled_start ?? new Date().toISOString();
    const end = new Date(
      new Date(start).getTime() + (t.estimated_minutes ?? 30) * 60_000
    ).toISOString();

    return {
      id: t.id,
      title: t.title,
      type: "task",
      start,
      end,
      courseId: t.course_id ?? undefined,
      notes: t.description ?? undefined,
      status: mapTaskStatus(t.status),
      parentId: t.assignment_id ?? undefined,
    };
  });

  return [...assessmentEvents, ...taskEvents];
}