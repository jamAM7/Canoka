import "server-only";
import { weekModuleKey } from "@/lib/notes/weeks";
import { CanvasError, MAX_WORKERS, mapLimit, type CanvasClient } from "./client";
import { htmlToMarkdown } from "./markdown";

// A Canvas subject as the rows the app keeps for it: the course, its Canvas
// modules, a synthetic module for each teaching week Canvas has no module named
// for, and its assessments. A port of what scraper/scrape.py (which subjects),
// scraper/canvas/build.py (fetching them) and scraper/week_rows.py's `subject`
// command did (that script is gone; git history has it), reading Canvas
// directly instead of a scrape on disk, so it runs on the hosted site too. The
// Python names are kept so the code reads side by side with the scraper's.
//
// SYNTHETIC WEEK MODULES. Canvas modules aren't weeks. 41201 has a module per
// week, but 41129 files its weekly slides as items titled "Week 3 - ..." inside
// one "Learning Contents" module, and 41052 names no weeks at all. So that every
// note can belong to a week, `weeks` lists a placeholder module for each
// teaching week no real module names: external_module_id "canoka:week:N", name
// "Week N" (lib/notes/weeks). They exist nowhere in Canvas. The weeks are a
// whole session, at least 12, longer if the subject names a later week in a
// module, module item or assessment.

/** Teaching weeks in a UTS session. */
const SESSION_WEEKS = 12;
/** Past this, a "week" in a name is something else, like week 52 of a year. */
const LAST_POSSIBLE_WEEK = 20;
// The same pattern as the database's course_modules.week_number and lib/scraper/subjects.ts.
const WEEK = /\bweek\s*(\d{1,2})\b/i;
const CODE = /\b(\d{5})\b/;

// ------------------------------------------------------------ what Canvas returns

/** A course as GET /api/v1/courses returns it with include[]=term. Only what's read here. */
export interface CanvasCourse {
  id: string;
  name?: string | null;
  course_code?: string | null;
  sis_course_id?: string | null;
  start_at?: string | null;
  end_at?: string | null;
  apply_assignment_group_weights?: boolean | null;
  access_restricted_by_date?: boolean;
  term?: { name?: string | null; start_at?: string | null; end_at?: string | null } | null;
}

interface CanvasModuleItem {
  title?: string | null;
  type?: string | null;
  html_url?: string | null;
  external_url?: string | null;
  page_url?: string | null;
  content_id?: string | number | null;
}

interface CanvasModule {
  id: string;
  name?: string | null;
  position?: number | null;
  unlock_at?: string | null;
  published?: boolean | null;
  items?: CanvasModuleItem[] | null;
  items_count?: number;
}

interface CanvasCriterion {
  description?: string | null;
  long_description?: string | null;
  points?: number | null;
  ratings?: { description?: string | null; long_description?: string | null; points?: number | null }[] | null;
}

interface CanvasAssignment {
  id: string;
  name?: string | null;
  description?: string | null;
  due_at?: string | null;
  unlock_at?: string | null;
  lock_at?: string | null;
  points_possible?: number | null;
  submission_types?: string[] | null;
  group_category_id?: string | null;
  grading_type?: string | null;
  omit_from_final_grade?: boolean | null;
  published?: boolean | null;
  html_url?: string | null;
  rubric?: CanvasCriterion[] | null;
  all_dates?: { due_at?: string | null }[] | null;
}

interface CanvasGroup {
  name?: string | null;
  group_weight?: number | null;
  assignments?: CanvasAssignment[] | null;
}

// ------------------------------------------------------------ the subject document

/** A module item as build.py records it: a pointer, never the page body. */
export interface ModuleItem {
  title: string | null;
  type: string | null;
  /** The item's Canvas page (html_url), else its external URL. */
  url: string | null;
  /** Page items: the page's slug. */
  page_url?: string;
  /** ExternalUrl items. */
  external_url?: string | null;
  /** Assignment, Quiz, File and Discussion items: what the item points at. */
  content_id?: string | null;
}

export interface Module {
  id: string;
  name: string | null;
  position: number | null;
  unlock_at: string | null;
  published: boolean | null;
  items: ModuleItem[];
}

export interface RubricCriterion {
  criterion: string | null;
  points: number | null;
  detail: string | null;
  ratings: { label: string | null; points: number | null; detail: string | null }[];
}

export interface Assessment {
  id: string;
  name: string | null;
  group: string | null;
  weight_pct: number | null;
  points_possible: number | null;
  due_at: string | null;
  unlock_at: string | null;
  lock_at: string | null;
  submission_types: string[];
  is_group_work: boolean;
  published: boolean | null;
  /** The description as markdown, or "" if Canvas has none. */
  brief: string;
  rubric: RubricCriterion[];
  /** Where the task is probably described when Canvas has no brief (build.py's content_status). */
  likely_source: string[];
  url: string | null;
}

/** An endpoint's outcome, as build.py's _meta.coverage. */
export interface Coverage {
  status: string;
  note?: string;
}

/** The parts of build.py's subject document the app uses, with the same keys. */
export interface SubjectDocument {
  subject: {
    code: string | null;
    name: string;
    course_id: string;
    session: string | null;
    start_at: string | null;
    end_at: string | null;
  };
  modules: Module[];
  assessments: Assessment[];
  /** What couldn't be read, by endpoint. */
  coverage: Record<string, Coverage>;
}

// ------------------------------------------------------------ the database rows

/** A subject as database rows, in the shape week_rows.py's `subject` command printed. */
export interface SubjectRows {
  course: {
    external_course_id: string;
    course_code: string | null;
    name: string;
    term_name: string | null;
    start_date: string | null;
    end_date: string | null;
  };
  canvas_host: string | null;
  modules: {
    external_module_id: string;
    name: string;
    position: number | null;
    unlock_at: string | null;
    published: boolean;
  }[];
  /** Placeholders for the weeks no Canvas module is named for. */
  weeks: { number: number; external_module_id: string; name: string }[];
  /** Teaching weeks in all, with or without a Canvas module. */
  week_count: number;
  assessments: {
    external_assignment_id: string;
    name: string;
    description: string | null;
    due_at: string | null;
    available_from: string | null;
    available_until: string | null;
    points_possible: number | null;
    assignment_group: string | null;
    weight: number | null;
  }[];
}

// ------------------------------------------------------------ which subjects

export interface SubjectList {
  courses: CanvasCourse[];
  /** The session synced, e.g. "Spring 2026 (City campus)", if one was picked. */
  session: string | null;
  warnings: string[];
}

/** The student's subjects this session: scrape.py's default, with no flags. */
export async function currentSubjects(client: CanvasClient, now = new Date()): Promise<SubjectList> {
  // Courses with no subject code are induction modules, academic integrity and org sites.
  const subjects = (await listCourses(client, false)).filter((course) => subjectCode(course));
  const session = pickSession(subjects, now);
  if (!session) return { courses: subjects, session: null, warnings: [] };

  const needle = session.name.toLowerCase();
  const kept = subjects.filter((course) => (course.term?.name ?? "").toLowerCase().includes(needle));
  if (kept.length === 0) return { courses: subjects, session: null, warnings: [] };

  const warnings: string[] = [];
  if (session.basis === "between_sessions") {
    // scrape.py stops here and asks for --session. Settings has no such option, so take the nearest.
    warnings.push(`No session is running today, so these are from the nearest one, ${session.name}.`);
  } else if (!session.verified) {
    const reason = session.basis === "name_majority" ? "Canvas publishes no dates for it" : "today falls outside its dates";
    warnings.push(`Couldn't confirm ${session.name} is the current session: ${reason}.`);
  }
  return { courses: kept, session: session.name, warnings };
}

/** The subjects these codes or Canvas course ids name, from any session: scrape.py --include-concluded --courses. */
export async function findSubjects(client: CanvasClient, wanted: string[]): Promise<SubjectList> {
  const courses = (await listCourses(client, true)).filter(
    (course) => wanted.includes(subjectCode(course) ?? "") || wanted.includes(String(course.id)),
  );
  const found = new Set(courses.flatMap((course) => [subjectCode(course), String(course.id)]));
  const missing = wanted.filter((w) => !found.has(w));
  return {
    courses,
    session: null,
    warnings: missing.length > 0 ? [`Canvas doesn't list ${missing.join(", ")} for you.`] : [],
  };
}

async function listCourses(client: CanvasClient, includeConcluded: boolean): Promise<CanvasCourse[]> {
  let courses = await client.list<CanvasCourse>("/api/v1/courses", { "include[]": ["term"], enrollment_state: "active" });
  if (includeConcluded) {
    const seen = new Set(courses.map((c) => String(c.id)));
    const done = await client.list<CanvasCourse>("/api/v1/courses", { "include[]": ["term"], enrollment_state: "completed" });
    courses = [...courses, ...done.filter((c) => !seen.has(String(c.id)))];
  }
  // Courses you can't read come back as stubs with an access_restricted flag.
  return courses.filter((c) => c.id && !c.access_restricted_by_date);
}

interface Session {
  name: string;
  basis: "term_dates" | "between_sessions" | "name_majority";
  /** Whether today falls inside the session's dates. */
  verified: boolean;
}

/**
 * Which term is the current one, as scrape.py's pick_session decides. A term
 * whose dates contain now is the only answer the clock can confirm. UTS
 * sometimes leaves those dates null, so fall back to the term name most
 * subjects share, unverified. If there are dates and none contain now, it's
 * between sessions, and the latest-ending term is the nearest.
 */
function pickSession(courses: CanvasCourse[], now = new Date()): Session | null {
  const live: string[] = [];
  const dated: { name: string; end: Date | null }[] = [];
  for (const course of courses) {
    const term = course.term ?? {};
    const name = term.name;
    const start = toDate(term.start_at);
    const end = toDate(term.end_at);
    if (!name) continue;
    if (start || end) dated.push({ name, end });
    if (start && start <= now && (!end || now <= end)) live.push(name);
  }

  if (live.length > 0) return sessionRecord(courses, mostCommon(live), now, "term_dates");
  if (dated.length > 0) {
    const latest = dated.reduce((best, d) => (d.end && (!best.end || d.end > best.end) ? d : best));
    return sessionRecord(courses, latest.name, now, "between_sessions");
  }
  const named = courses.filter((c) => subjectCode(c)).flatMap((c) => (c.term?.name ? [c.term.name] : []));
  return named.length > 0 ? sessionRecord(courses, mostCommon(named), now, "name_majority") : null;
}

function sessionRecord(courses: CanvasCourse[], name: string, now: Date, basis: Session["basis"]): Session {
  // The widest start and end across every course carrying this term name.
  const needle = name.toLowerCase();
  const starts: Date[] = [];
  const ends: Date[] = [];
  for (const course of courses) {
    if (!(course.term?.name ?? "").toLowerCase().includes(needle)) continue;
    const start = toDate(course.term?.start_at);
    const end = toDate(course.term?.end_at);
    if (start) starts.push(start);
    if (end) ends.push(end);
  }
  const start = starts.length > 0 ? Math.min(...starts.map(Number)) : null;
  const end = ends.length > 0 ? Math.max(...ends.map(Number)) : null;
  return { name, basis, verified: start !== null && start <= +now && (end === null || +now <= end) };
}

/** The commonest value, the first seen of those tied, as Counter.most_common(1). */
function mostCommon(values: string[]): string {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  let best = values[0];
  counts.forEach((count, value) => {
    if (count > (counts.get(best) ?? 0)) best = value;
  });
  return best;
}

// ------------------------------------------------------------ fetching a subject

/** A subject by its Canvas course id, e.g. for the week a review is about. */
export async function fetchSubjectById(client: CanvasClient, courseId: string): Promise<SubjectDocument> {
  return fetchSubject(client, await client.get<CanvasCourse>(`/api/v1/courses/${courseId}`, { "include[]": ["term"] }));
}

/** A course Canvas listed, with its modules and assessments. A hidden tab leaves a coverage gap, not a failure. */
export async function fetchSubject(client: CanvasClient, course: CanvasCourse): Promise<SubjectDocument> {
  const id = String(course.id);
  const path = (suffix: string) => `/api/v1/courses/${id}/${suffix}`;
  const coverage: Record<string, Coverage> = {};

  const [groups, details, modules] = await Promise.all([
    safe(coverage, "assignment_groups", () =>
      client.list<CanvasGroup>(path("assignment_groups"), { "include[]": ["assignments"] }),
    [] as CanvasGroup[]),
    // The copies nested in assignment_groups omit some fields, so pull the full objects too.
    // all_dates carries section overrides, which is where the real due date lives when the base has none.
    safe(coverage, "assignment_details", () =>
      client.list<CanvasAssignment>(path("assignments"), { "include[]": ["all_dates"] }),
    [] as CanvasAssignment[]),
    safe(coverage, "modules", () => fetchModules(client, id), [] as Module[]),
  ]);

  return {
    subject: {
      code: subjectCode(course),
      name: cleanName(course),
      course_id: id,
      session: course.term?.name ?? null,
      start_at: course.start_at ?? null,
      end_at: course.end_at ?? null,
    },
    modules,
    assessments: assessments(course, groups, details, client.baseUrl),
    coverage,
  };
}

/** Runs one endpoint, as build.py's _safe: a hidden tab must not lose the whole subject. A rejected token still fails. */
async function safe<T>(coverage: Record<string, Coverage>, name: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    const value = await fn();
    coverage[name] = { status: "ok" };
    return value;
  } catch (error) {
    if (!(error instanceof CanvasError) || error.badToken) throw error;
    coverage[name] = coverageOf(error);
    return fallback;
  }
}

/** What a failed request says about the subject. */
export function coverageOf(error: CanvasError): Coverage {
  if (error.forbidden) return { status: "forbidden", note: "hidden or restricted tab" };
  // Canvas says this when staff switch a tab off: a fact about the subject, not a failure to read it.
  if (/has been disabled for this course/i.test(error.message)) return { status: "disabled", note: "tab switched off by teaching staff" };
  return { status: "error", note: error.message.slice(0, 200) };
}

async function fetchModules(client: CanvasClient, courseId: string): Promise<Module[]> {
  const listed = await client.list<CanvasModule>(`/api/v1/courses/${courseId}/modules`, { "include[]": ["items"] });
  const modules = await mapLimit(listed, MAX_WORKERS, async (module) => {
    // Canvas leaves items off a module it thinks has too many to inline. Ask for them on their own.
    const items =
      module.items ??
      (module.items_count
        ? await client.list<CanvasModuleItem>(`/api/v1/courses/${courseId}/modules/${module.id}/items`)
        : []);
    return {
      id: String(module.id),
      name: module.name ?? null,
      position: module.position ?? null,
      unlock_at: module.unlock_at ?? null,
      published: module.published ?? null,
      items: items.map(moduleItem),
    };
  });
  return modules.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
}

function moduleItem(item: CanvasModuleItem): ModuleItem {
  const record: ModuleItem = {
    title: item.title ?? null,
    type: item.type ?? null,
    url: item.html_url || item.external_url || null,
  };
  if (item.type === "Page") {
    // Canvas omits page_url on some instances; the slug is the slugified title, which the page fetch needs.
    record.page_url = item.page_url || slugify(item.title ?? "");
  } else if (item.type === "ExternalUrl") {
    record.external_url = item.external_url ?? null;
  } else if (item.type === "Assignment" || item.type === "Quiz" || item.type === "File" || item.type === "Discussion") {
    record.content_id = item.content_id != null ? String(item.content_id) : null;
  }
  return record;
}

function assessments(
  course: CanvasCourse,
  groups: CanvasGroup[],
  details: CanvasAssignment[],
  baseUrl: string,
): Assessment[] {
  const byId = new Map(details.map((a) => [String(a.id), a]));
  const weights = computeWeights(course, groups);
  const out: Assessment[] = [];
  for (const group of groups) {
    for (const assignment of group.assignments ?? []) {
      const id = String(assignment.id);
      const detail: Partial<CanvasAssignment> = byId.get(id) ?? {};
      // Prefer whichever copy actually carries a description.
      const description = assignment.description || detail.description || null;
      const submissionTypes = assignment.submission_types ?? [];
      out.push({
        id,
        name: assignment.name ?? null,
        group: group.name ?? null,
        weight_pct: weights.get(id) ?? null,
        points_possible: assignment.points_possible ?? null,
        due_at: assignment.due_at || detail.due_at || detail.all_dates?.find((d) => d.due_at)?.due_at || null,
        unlock_at: assignment.unlock_at || detail.unlock_at || null,
        lock_at: assignment.lock_at || detail.lock_at || null,
        submission_types: submissionTypes,
        is_group_work: Boolean(assignment.group_category_id),
        published: assignment.published ?? null,
        brief: htmlToMarkdown(description, baseUrl),
        rubric: rubric(assignment.rubric ?? detail.rubric),
        likely_source: likelySource(assignment.name ?? "", submissionTypes, description),
        url: assignment.html_url ?? null,
      });
    }
  }
  const order = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return out.sort((a, b) => order(a.due_at ?? "9999", b.due_at ?? "9999") || order(a.name ?? "", b.name ?? ""));
}

/**
 * Each assignment's share of the final grade, in percent: from the group
 * weights when the course applies them, else from points. Null for an
 * assignment that doesn't count. build.py's compute_weights.
 */
function computeWeights(course: CanvasCourse, groups: CanvasGroup[]): Map<string, number | null> {
  const counts = (a: CanvasAssignment) =>
    !a.omit_from_final_grade && a.grading_type !== "not_graded" && (a.points_possible ?? 0) > 0;
  const points = (list: CanvasAssignment[]) => list.reduce((sum, a) => sum + (a.points_possible ?? 0), 0);
  const round = (value: number) => Math.round(value * 100) / 100;
  const weights = new Map<string, number | null>();

  if (course.apply_assignment_group_weights) {
    for (const group of groups) {
      const total = points((group.assignments ?? []).filter(counts));
      for (const a of group.assignments ?? []) {
        const share = counts(a) && total ? ((a.points_possible ?? 0) / total) * (group.group_weight ?? 0) : null;
        weights.set(String(a.id), share === null ? null : round(share));
      }
    }
    return weights;
  }

  const total = points(groups.flatMap((g) => (g.assignments ?? []).filter(counts)));
  for (const group of groups) {
    for (const a of group.assignments ?? []) {
      weights.set(String(a.id), counts(a) && total ? round(((a.points_possible ?? 0) / total) * 100) : null);
    }
  }
  return weights;
}

function rubric(criteria: CanvasCriterion[] | null | undefined): RubricCriterion[] {
  return (criteria ?? []).map((c) => ({
    criterion: c.description ?? null,
    points: c.points ?? null,
    detail: c.long_description ?? null,
    ratings: (c.ratings ?? []).map((r) => ({
      label: r.description ?? null,
      points: r.points ?? null,
      detail: r.long_description ?? null,
    })),
  }));
}

/** Where a task is described when Canvas isn't the place, as build.py's _content_status says. */
function likelySource(name: string, submissionTypes: string[], description: string | null): string[] {
  const elsewhere: string[] = [];
  if (/^\s*\[\s*ed\s*\]/i.test(name)) elsewhere.push("Ed (the assignment name is prefixed [ed])");
  // submission_types ["none"] means the row exists only to carry a mark.
  if (submissionTypes.includes("none") && !description) elsewhere.push("the subject outline / Subject Information LTI");
  return elsewhere;
}

// ------------------------------------------------------------ rows

/** The subject's database rows, as week_rows.py's subject_rows made them. */
export function subjectRows(document: SubjectDocument, canvasHost: string): SubjectRows {
  const { subject } = document;
  const modules = document.modules.map((m) => ({
    external_module_id: m.id,
    name: m.name || `Module ${m.id}`,
    position: m.position,
    unlock_at: m.unlock_at,
    published: m.published !== false,
  }));

  // The same rule as the database's course_modules.week_number: "Week N", 1 to 20.
  const named = new Set(modules.map((m) => weekLabel(m.name)));
  const last = lastWeek(document);
  const weeks: SubjectRows["weeks"] = [];
  for (let n = 1; n <= last; n++) {
    if (!named.has(n)) weeks.push({ number: n, external_module_id: weekModuleKey(n), name: `Week ${n}` });
  }

  return {
    course: {
      external_course_id: subject.course_id,
      course_code: subject.code,
      name: subject.name || subject.course_id,
      term_name: subject.session,
      start_date: day(subject.start_at),
      end_date: day(subject.end_at),
    },
    canvas_host: canvasHost,
    modules,
    weeks,
    week_count: last,
    assessments: document.assessments
      .filter((a) => a.id)
      .map((a) => ({
        external_assignment_id: a.id,
        name: a.name || `Assignment ${a.id}`,
        description: a.brief,
        due_at: a.due_at,
        available_from: a.unlock_at,
        available_until: a.lock_at,
        points_possible: a.points_possible,
        assignment_group: a.group,
        weight: a.weight_pct,
      })),
  };
}

/** The last teaching week: a session's worth, or later if the subject names one. */
function lastWeek(document: SubjectDocument): number {
  const candidates = [
    ...document.assessments.map((a) => weekLabel(a.name)),
    ...document.modules.flatMap((m) => [weekLabel(m.name), ...m.items.map((item) => weekLabel(item.title))]),
  ];
  let last = SESSION_WEEKS;
  for (const week of candidates) {
    if (week && week <= LAST_POSSIBLE_WEEK) last = Math.max(last, week);
  }
  return last;
}

// ------------------------------------------------------------ names

/** The week a module, item or assessment name refers to, if it names one. None is an ordinary answer. */
export function weekLabel(text: string | null | undefined): number | null {
  const match = WEEK.exec(text ?? "");
  return match ? Number(match[1]) : null;
}

/** The UTS subject code, e.g. "41052", from the course code, name or SIS id. */
export function subjectCode(course: CanvasCourse): string | null {
  for (const field of [course.course_code, course.name, course.sis_course_id]) {
    const match = CODE.exec(field ?? "");
    if (match) return match[1];
  }
  return null;
}

/** "41052 Advanced Algorithms" -> "Advanced Algorithms". */
function cleanName(course: CanvasCourse): string {
  const name = (course.name ?? "").trim();
  return name.replace(/^\d{5}[\s:_-]*/, "").trim() || name;
}

function slugify(value: string, limit = 60): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, limit) || "course";
}

/** An ISO timestamp's date part, for a `date` column. */
function day(stamp: string | null): string | null {
  return stamp ? stamp.slice(0, 10) : null;
}

function toDate(stamp: string | null | undefined): Date | null {
  if (!stamp) return null;
  const date = new Date(stamp);
  return Number.isNaN(date.getTime()) ? null : date;
}
