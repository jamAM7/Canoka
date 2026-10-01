import type { ScheduledSubtask } from "./schedule";

// The rows written to study_plans and study_tasks. Their own module so a test
// can check every key against docs/supabase-schema.json without a database.

/** A study plan the AI makes for a subject. Its dates cover today to the last deadline. */
export function newPlanRow(userId: string, name: string, today: string, lastDue: string) {
  return {
    user_id: userId,
    name,
    start_date: today,
    // study_plans_check: end_date >= start_date.
    end_date: lastDue < today ? today : lastDue,
    generated_by: "ai" as const,
    status: "active" as const,
  };
}

/**
 * One assessment's subtasks as study_tasks rows. `assignment_id` is what
 * makes the calendar show them as the assessment's subtasks; status and
 * priority are left to their defaults (pending, 3).
 */
export function taskRows(ids: { planId: string; courseId: string; assignmentId: string }, tasks: ScheduledSubtask[]) {
  return tasks.map((t) => ({
    study_plan_id: ids.planId,
    course_id: ids.courseId,
    assignment_id: ids.assignmentId,
    title: t.title,
    description: t.description,
    scheduled_date: t.date,
    scheduled_start: t.start.toISOString(),
    estimated_minutes: t.minutes,
    order_index: t.order,
  }));
}
