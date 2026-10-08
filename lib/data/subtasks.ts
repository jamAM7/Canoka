import "server-only";
import { planSubtasks, type SubtaskContext } from "@/lib/ai/subtasks";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { AssignmentRow, CourseContentRow, CourseRow, StudyPlanRow, StudyPreferencesRow, StudyTaskRow } from "@/lib/supabase/types";
import { skipReason } from "@/lib/subtasks/eligibility";
import { newPlanRow, taskRows } from "@/lib/subtasks/rows";
import { daysBetween, localDate, prefsFromRow, scheduleSubtasks, type StudyPrefs } from "@/lib/subtasks/schedule";
import type { CreatedItem, FailedItem, GenerateResult, SkippedItem } from "@/lib/subtasks/types";
import { dbError } from "./db-error";
import { NotesError, isUuid } from "./notes";
import type { CurrentUser } from "./user";

// AI subtasks for assessments: Claude breaks an assessment into subtasks,
// lib/subtasks/schedule puts them on the student's calendar between now and the
// deadline, and they're saved as study_tasks in the student's AI study plan.
// The calendar (lib/data/calendar) already shows study_tasks, with their
// assignment_id as the assessment they belong to, so nothing else has to change.
//
// Every query is scoped to the student: the service role skips RLS.
//
// Which tasks are "AI subtasks": those in a study plan with generated_by = 'ai'.
// A task a student makes themselves belongs in a plan with generated_by = 'user',
// so skipping and regenerating never touch it.

/** Assessments sent to Claude in one request. The rest are `remaining`: press the button again. */
export const MAX_PER_REQUEST = 10;
/** Requests to Claude in flight at once. */
const CONCURRENCY = 3;
/** Characters of brief and marking criteria sent for one assessment. */
const MAX_TEXT_CHARS = 12_000;
/** Ids per `in (...)` filter, to keep request URLs short. */
const ID_CHUNK = 40;

type CourseFields = Pick<CourseRow, "id" | "course_code" | "name">;
type AssignmentFields = Pick<
  AssignmentRow,
  "id" | "course_id" | "external_assignment_id" | "name" | "description" | "due_at" | "points_possible" | "weight"
>;

export interface GenerateInput {
  /** One assessment (assignments.id), or null for every assessment that qualifies. */
  assignmentId: string | null;
  /** Replace an assessment's existing AI subtasks, completed ones included. */
  regenerate: boolean;
}

export function parseGenerateInput(body: unknown): GenerateInput {
  const raw = (body ?? {}) as Record<string, unknown>;
  if (raw.assignmentId !== undefined && raw.assignmentId !== null && !isUuid(raw.assignmentId)) {
    throw new NotesError("Choose an assessment from the calendar.", 400);
  }
  if (raw.regenerate !== undefined && typeof raw.regenerate !== "boolean") {
    throw new NotesError("regenerate is true or false.", 400);
  }
  return { assignmentId: (raw.assignmentId as string | null | undefined) ?? null, regenerate: raw.regenerate === true };
}

// One generation per student at a time: each asks Claude several times, and a second click shouldn't pay again.
const store = globalThis as typeof globalThis & { canokaSubtasks?: Set<string> };
const running = (store.canokaSubtasks ??= new Set<string>());

export async function generateSubtasks(user: CurrentUser, input: GenerateInput): Promise<GenerateResult> {
  if (running.has(user.id)) throw new NotesError("Subtasks are already being generated. Wait for that to finish.", 409);
  running.add(user.id);
  try {
    return await generate(user, input);
  } finally {
    running.delete(user.id);
  }
}

async function generate(user: CurrentUser, input: GenerateInput): Promise<GenerateResult> {
  const now = new Date();
  const result: GenerateResult = { created: [], skipped: [], failed: [], remaining: 0 };

  const courses = await enrolledCourses(user.id);
  const assignments = await loadAssignments(
    courses.map((c) => c.id),
    input.assignmentId,
  );
  if (input.assignmentId && assignments.length === 0) throw new NotesError("That assessment isn't one of yours.", 404);
  if (assignments.length === 0) return result;

  const texts = await assessmentTexts(assignments);
  const existing = await existingSubtasks(user.id, assignments.map((a) => a.id));

  // Decide, for every assessment, whether it gets subtasks, and say why not if it doesn't.
  const eligible: AssignmentFields[] = [];
  for (const a of assignments) {
    const reason = skipReason(
      {
        name: a.name,
        dueAt: a.due_at,
        weight: a.weight,
        points: a.points_possible,
        textChars: (texts.get(a.id) ?? "").length,
        hasSubtasks: (existing.get(a.id)?.length ?? 0) > 0,
      },
      { now, explicit: input.assignmentId !== null, regenerate: input.regenerate },
    );
    if (reason) result.skipped.push({ assignmentId: a.id, name: a.name, reason });
    else eligible.push(a);
  }

  // Soonest deadline first, so a capped request does the most urgent ones.
  eligible.sort((a, b) => Date.parse(a.due_at as string) - Date.parse(b.due_at as string));
  const batch = eligible.slice(0, MAX_PER_REQUEST);
  result.remaining = eligible.length - batch.length;
  if (batch.length === 0) return result;

  const prefs = await loadPrefs(user.id);
  const today = localDate(now.getTime(), user.timezone);

  // Plans first, one at a time: two assessments of one subject would race to create its plan.
  const courseById = new Map(courses.map((c) => [c.id, c]));
  const planByCourse = new Map<string, string>();
  for (const courseId of Array.from(new Set(batch.map((a) => a.course_id)))) {
    const lastDue = batch
      .filter((a) => a.course_id === courseId)
      .map((a) => localDate(Date.parse(a.due_at as string), user.timezone))
      .reduce((latest, d) => (d > latest ? d : latest), today);
    planByCourse.set(courseId, await ensurePlan(user.id, courseById.get(courseId) as CourseFields, today, lastDue));
  }

  const outcomes: (CreatedItem | SkippedItem | FailedItem)[] = new Array(batch.length);
  await pool(batch, CONCURRENCY, async (a, index) => {
    try {
      const course = courseById.get(a.course_id) as CourseFields;
      outcomes[index] = await generateOne({
        a,
        course,
        planId: planByCourse.get(a.course_id) as string,
        text: texts.get(a.id) as string,
        oldTaskIds: input.regenerate ? (existing.get(a.id) ?? []) : [],
        now,
        timezone: user.timezone,
        prefs,
      });
    } catch (error) {
      outcomes[index] = { assignmentId: a.id, name: a.name, error: error instanceof Error ? error.message : String(error) };
    }
  });
  for (const outcome of outcomes) {
    if ("count" in outcome) result.created.push(outcome);
    else if ("reason" in outcome) result.skipped.push(outcome);
    else result.failed.push(outcome);
  }
  return result;
}

interface One {
  a: AssignmentFields;
  course: CourseFields;
  planId: string;
  text: string;
  /** AI subtasks to remove once the new ones are saved. */
  oldTaskIds: string[];
  now: Date;
  timezone: string;
  prefs: StudyPrefs;
}

async function generateOne(o: One): Promise<CreatedItem | SkippedItem> {
  const { a, now, timezone } = o;
  const due = new Date(a.due_at as string);
  const todayDate = localDate(now.getTime(), timezone);
  const dueDate = localDate(due.getTime(), timezone);

  const context: SubtaskContext = {
    subject: [o.course.course_code, o.course.name].filter(Boolean).join(" "),
    name: a.name,
    weight: a.weight,
    points: a.points_possible,
    dueLabel: label(due, timezone, true),
    todayLabel: label(now, timezone, false),
    daysAvailable: daysBetween(todayDate, dueDate) + 1,
    text: o.text,
  };
  const planned = await planSubtasks(context);
  const schedule = scheduleSubtasks(planned, { now, due, timezone, prefs: o.prefs });
  // Not even one session fits before the deadline.
  if (schedule.tasks.length === 0) return { assignmentId: a.id, name: a.name, reason: "too_soon" };

  const db = supabaseAdmin();
  const { error } = await db
    .from("study_tasks")
    .insert(taskRows({ planId: o.planId, courseId: a.course_id, assignmentId: a.id }, schedule.tasks));
  if (error) throw dbError(`Couldn't save the subtasks for ${a.name}`, error);

  // New ones first, then the old: a failed save loses nothing.
  let replaced = 0;
  let warning: string | undefined;
  if (o.oldTaskIds.length > 0) {
    const { error: deleteError } = await db.from("study_tasks").delete().in("id", o.oldTaskIds);
    if (deleteError) warning = `The new subtasks are saved, but the old ones couldn't be removed: ${deleteError.message}`;
    else replaced = o.oldTaskIds.length;
  }
  return {
    assignmentId: a.id,
    name: a.name,
    count: schedule.tasks.length,
    tight: schedule.tight,
    dropped: schedule.dropped,
    replaced,
    ...(warning ? { warning } : {}),
  };
}

// ---------------------------------------------------------------- reading

async function enrolledCourses(userId: string): Promise<CourseFields[]> {
  const { data, error } = await supabaseAdmin()
    .from("course_enrolments")
    .select("courses(id, course_code, name)")
    .eq("user_id", userId)
    .eq("status", "active")
    .overrideTypes<{ courses: CourseFields | null }[], { merge: false }>();
  if (error) throw dbError("Couldn't load your subjects", error);
  return data.flatMap((row) => (row.courses ? [row.courses] : []));
}

/** Every assignment of these courses, dated or not, so each skip can be reported. */
async function loadAssignments(courseIds: string[], assignmentId: string | null): Promise<AssignmentFields[]> {
  if (courseIds.length === 0) return [];
  let query = supabaseAdmin()
    .from("assignments")
    .select("id, course_id, external_assignment_id, name, description, due_at, points_possible, weight")
    .in("course_id", courseIds);
  if (assignmentId) query = query.eq("id", assignmentId);
  const { data, error } = await query.overrideTypes<AssignmentFields[], { merge: false }>();
  if (error) throw dbError("Couldn't load your assessments", error);
  return data;
}

/**
 * What Claude reads for each assessment, by assignment id: the stored
 * assessment text if the week's content has been saved (it includes the marking
 * criteria), else the brief. Trimmed; empty when there's neither.
 */
async function assessmentTexts(assignments: AssignmentFields[]): Promise<Map<string, string>> {
  const stored = new Map<string, string>();
  const courseIds = Array.from(new Set(assignments.map((a) => a.course_id)));
  for (const ids of chunk(assignments.map((a) => a.external_assignment_id))) {
    const { data, error } = await supabaseAdmin()
      .from("course_content")
      .select("course_id, external_content_id, body_text")
      .eq("content_type", "assignment")
      .in("course_id", courseIds)
      .in("external_content_id", ids)
      .overrideTypes<Pick<CourseContentRow, "course_id" | "external_content_id" | "body_text">[], { merge: false }>();
    if (error) throw dbError("Couldn't load the assessments' content", error);
    for (const row of data) stored.set(`${row.course_id}:${row.external_content_id}`, (row.body_text ?? "").trim());
  }
  return new Map(
    assignments.map((a) => {
      const rich = stored.get(`${a.course_id}:${a.external_assignment_id}`) ?? "";
      return [a.id, (rich || (a.description ?? "").trim()).slice(0, MAX_TEXT_CHARS)];
    }),
  );
}

/** The student's existing AI subtasks (task ids) per assignment. */
async function existingSubtasks(userId: string, assignmentIds: string[]): Promise<Map<string, string[]>> {
  const found = new Map<string, string[]>();
  const db = supabaseAdmin();
  const { data: plans, error } = await db
    .from("study_plans")
    .select("id")
    .eq("user_id", userId)
    .eq("generated_by", "ai")
    .neq("status", "archived")
    .overrideTypes<Pick<StudyPlanRow, "id">[], { merge: false }>();
  if (error) throw dbError("Couldn't load your study plans", error);
  if (plans.length === 0) return found;

  for (const ids of chunk(assignmentIds)) {
    const { data, error: taskError } = await db
      .from("study_tasks")
      .select("id, assignment_id")
      .in(
        "study_plan_id",
        plans.map((p) => p.id),
      )
      .in("assignment_id", ids)
      .overrideTypes<Pick<StudyTaskRow, "id" | "assignment_id">[], { merge: false }>();
    if (taskError) throw dbError("Couldn't load your subtasks", taskError);
    for (const row of data) {
      if (row.assignment_id) found.set(row.assignment_id, [...(found.get(row.assignment_id) ?? []), row.id]);
    }
  }
  return found;
}

async function loadPrefs(userId: string): Promise<StudyPrefs> {
  const { data, error } = await supabaseAdmin()
    .from("study_preferences")
    .select("preferred_session_minutes, max_daily_minutes, preferred_start_time, preferred_end_time, study_days")
    .eq("user_id", userId)
    .overrideTypes<Pick<StudyPreferencesRow, "preferred_session_minutes" | "max_daily_minutes" | "preferred_start_time" | "preferred_end_time" | "study_days">[], { merge: false }>();
  if (error) throw dbError("Couldn't load your study preferences", error);
  return prefsFromRow(data[0] ?? null);
}

// ---------------------------------------------------------------- writing

/**
 * The student's AI study plan for a subject, made if it isn't there:
 * "<code> study plan", generated_by 'ai', active. Its end date is moved out to
 * cover the latest deadline. A unique index allows one active plan per name, so
 * if the insert loses a race (or the name is taken by a plan the AI didn't
 * make) it looks again before giving up.
 */
async function ensurePlan(userId: string, course: CourseFields, today: string, lastDue: string): Promise<string> {
  const db = supabaseAdmin();
  const name = `${course.course_code ?? course.name} study plan`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db
      .from("study_plans")
      .select("id, end_date")
      .eq("user_id", userId)
      .eq("name", name)
      .eq("generated_by", "ai")
      .eq("status", "active")
      .overrideTypes<Pick<StudyPlanRow, "id" | "end_date">[], { merge: false }>();
    if (error) throw dbError("Couldn't load your study plan", error);
    if (data[0]) {
      if (data[0].end_date < lastDue) {
        const { error: updateError } = await db.from("study_plans").update({ end_date: lastDue }).eq("id", data[0].id);
        if (updateError) throw dbError("Couldn't extend your study plan", updateError);
      }
      return data[0].id;
    }

    const { data: created, error: insertError } = await db
      .from("study_plans")
      .insert(newPlanRow(userId, name, today, lastDue))
      .select("id")
      .overrideTypes<Pick<StudyPlanRow, "id">[], { merge: false }>();
    if (!insertError) return created[0].id;
    if (insertError.code !== "23505") throw dbError("Couldn't create your study plan", insertError);
  }
  throw new Error(`A study plan called "${name}" already exists and wasn't made by Canoka. Rename it, then try again.`);
}

// ---------------------------------------------------------------- helpers

function chunk<T>(items: T[]): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += ID_CHUNK) chunks.push(items.slice(i, i + ID_CHUNK));
  return chunks;
}

/** Runs `work` over `items`, `size` at a time. */
async function pool<T>(items: T[], size: number, work: (item: T, index: number) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++;
        await work(items[index], index);
      }
    }),
  );
}

/** "Thu 5 Nov 2026, 11:59 pm" in the student's timezone; the time is left off for a plain date. */
function label(date: Date, timezone: string, withTime: boolean): string {
  return new Intl.DateTimeFormat("en-AU", {
    timeZone: timezone,
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
  }).format(date);
}
