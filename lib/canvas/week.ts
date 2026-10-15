import "server-only";
import { createHash } from "node:crypto";
import type { ContentType } from "@/lib/supabase/types";
import { CanvasError, MAX_WORKERS, mapLimit, type CanvasClient } from "./client";
import { htmlToMarkdown } from "./markdown";
import {
  coverageOf,
  fetchSubjectById,
  weekLabel,
  type Assessment,
  type Coverage,
  type Module,
  type ModuleItem,
  type RubricCriterion,
  type SubjectDocument,
} from "./subject";

// One week of a subject's Canvas content as course_content rows, one per item,
// for the AI review to check notes against: a port of scraper/week_rows.py's
// `week` command (gone now; git history has it) and the scraper/canvas/render.py
// helpers it used, reading Canvas directly. The week is found where render_week
// looks: modules named for it, items named for it inside other modules, and
// assessments named for it. Only the pages, quizzes and discussions those items
// point at are fetched.
//
// body_text is a markdown snippet like the scraper's module views, headings
// demoted into place. The rows don't say which module they belong to: the app
// files every one under the week's canonical module (lib/data/week-modules.ts).
//
// Unlike the Python, pages that repeat across subjects (UTS template filler)
// aren't flagged: that takes every subject at once, and the template pages sit
// in "Get started" rather than in a week. File contents aren't read either, as
// the scraper only read them with --extract.

/** One course_content row's fields, before it's given a course and module. */
export interface WeekItem {
  content_type: ContentType;
  external_content_id: string;
  title: string;
  body_text: string;
  source_url: string | null;
  position: number;
  published: boolean;
  content_updated_at: string | null;
}

/** external_content_id of the synthetic row saying what Canvas didn't give us, plus the week number. */
export const COVERAGE_PREFIX = "canoka:coverage:";
const COURSE_ID = /^\d{1,12}$/;
// Module item type -> course_content.content_type. SubHeader and anything else is left out.
const ITEM_KINDS: Record<string, ContentType> = {
  Page: "page",
  File: "file",
  Assignment: "assignment",
  Quiz: "quiz",
  Discussion: "discussion",
  ExternalUrl: "link",
  ExternalTool: "other",
};
const MODULE_ITEM = /\/modules\/items\/(\d+)/;
/** A row's own headings start here, below the week's and the item's. */
const HEADING_FLOOR = 4;

interface Page {
  title: string | null;
  content: string;
  updated_at: string | null;
  published: boolean | null;
  url: string | null;
}

interface Quiz {
  title: string | null;
  question_count: number | null;
  time_limit: number | null;
  points_possible: number | null;
  description: string;
  url: string | null;
}

interface Topic {
  title: string | null;
  message: string;
  url: string | null;
}

/** What the week's items point at, fetched. */
interface Reads {
  pages: Map<string, Page>;
  quizzes: Map<string, Quiz>;
  discussions: Map<string, Topic>;
  coverage: Record<string, Coverage>;
}

/** The week's content as rows, in the order a week reads. Throws if Canvas can't be read at all. */
export async function weekItems(
  client: CanvasClient,
  externalCourseId: string,
  week: number,
  timezone: string,
): Promise<WeekItem[]> {
  if (!COURSE_ID.test(externalCourseId)) throw new Error("This subject's Canvas id isn't one Canoka can read.");
  const document = await fetchSubjectById(client, externalCourseId);
  const webUrl = `${client.baseUrl}/courses/${externalCourseId}`;

  const weekModules = document.modules.filter((m) => weekLabel(m.name) === week);
  const namedItems = document.modules
    .filter((m) => weekLabel(m.name) === null)
    .flatMap((m) => m.items.filter((item) => weekLabel(item.title) === week));
  const reads = await readItems(client, externalCourseId, [...weekModules.flatMap((m) => m.items), ...namedItems]);
  const coverage = { ...document.coverage, ...reads.coverage };
  const assessments = new Map(document.assessments.filter((a) => a.id).map((a) => [a.id, a]));

  const rows: WeekItem[] = [];
  const seen = new Set<string>();

  const add = (
    kind: ContentType,
    externalId: string | null | undefined,
    title: string | null,
    body: string,
    sourceUrl: string | null,
    published = true,
    updated: string | null = null,
  ) => {
    const text = body.trim();
    const key = `${kind}:${externalId}`;
    // Nothing to say, or already added through another module: no row.
    if (!externalId || !text || seen.has(key)) return;
    seen.add(key);
    rows.push({
      content_type: kind,
      external_content_id: externalId,
      title: title || "Untitled",
      body_text: text,
      source_url: sourceUrl,
      position: rows.length + 1,
      published,
      content_updated_at: updated,
    });
  };

  const addAssessment = (a: Assessment) =>
    add("assignment", a.id, a.name, assessmentLines(a, timezone).join("\n"), a.url, a.published !== false);

  const addItem = (item: ModuleItem) => {
    const kind = ITEM_KINDS[item.type ?? ""];
    const title = item.title;
    const contentId = item.content_id ?? null;
    if (kind === "page") {
      const page = reads.pages.get(item.page_url ?? "");
      // Pages that were never retrieved say nothing.
      if (page) {
        add("page", item.page_url, page.title || title, itemLines([item], reads.pages).join("\n"),
          page.url || item.url, page.published !== false, page.updated_at);
      }
    } else if (kind === "file" && contentId) {
      add("file", contentId, title, itemLines([item], reads.pages).join("\n"), `${webUrl}/files/${contentId}`);
    } else if (kind === "assignment" && contentId && assessments.has(contentId)) {
      addAssessment(assessments.get(contentId)!);
    } else if (kind === "quiz" && contentId) {
      const quiz = reads.quizzes.get(contentId);
      const facts = [
        quiz?.question_count ? `${quiz.question_count} questions` : "",
        quiz?.time_limit ? `${quiz.time_limit} minutes` : "",
        quiz?.points_possible != null ? `${quiz.points_possible} points` : "",
      ].filter(Boolean);
      const lines = [`### ${title}`, ""];
      if (facts.length > 0) lines.push(`_${facts.join("; ")}_`, "");
      if (quiz?.description) lines.push(demote(quiz.description, HEADING_FLOOR));
      add("quiz", contentId, quiz?.title || title, lines.join("\n"), quiz?.url || item.url);
    } else if (kind === "discussion" && contentId) {
      const topic = reads.discussions.get(contentId);
      const message = topic?.message ?? "";
      add("discussion", contentId, title, message ? `### ${title}\n\n${demote(message, HEADING_FLOOR)}` : `- ${title}`,
        topic?.url || item.url);
    } else if (kind === "link" || kind === "other") {
      const found = MODULE_ITEM.exec(item.url ?? "");
      const url = item.external_url ?? "";
      const externalId = found ? found[1] : url ? createHash("sha1").update(url).digest("hex").slice(0, 16) : null;
      const body = kind === "link" ? itemLines([item], reads.pages).join("\n") : `- ${title} (external tool)`;
      add(kind, externalId, title, body, url || item.url);
    }
  };

  // The same three places render_week looks, in the same order.
  for (const module of weekModules) {
    if (!hasContent(document, module, reads.pages)) continue;
    for (const item of module.items) addItem(item);
    for (const assessment of assessmentsFor(document, module)) addAssessment(assessment);
  }
  for (const item of namedItems) addItem(item);
  for (const assessment of document.assessments) {
    if (assessment.id && weekLabel(assessment.name) === week) addAssessment(assessment);
  }

  // SYNTHETIC ROW, not from Canvas: what couldn't be read, so the review doesn't take a missing
  // reading for one that doesn't exist. Always written, and empty when nothing is missing, so an
  // old caveat can't outlive the gap it described.
  rows.push({
    content_type: "other",
    external_content_id: `${COVERAGE_PREFIX}${week}`,
    title: "Canvas coverage note",
    body_text: gaps(coverage),
    source_url: null,
    position: rows.length + 1,
    published: true,
    content_updated_at: null,
  });
  return rows;
}

/** Fetches the pages, quizzes and discussions the items point at. One that can't be read is a coverage gap. */
async function readItems(client: CanvasClient, courseId: string, items: ModuleItem[]): Promise<Reads> {
  const base = `/api/v1/courses/${courseId}`;
  const ids = (type: string, key: "page_url" | "content_id") =>
    Array.from(new Set(items.filter((i) => i.type === type).map((i) => i[key]).filter((v): v is string => Boolean(v))));
  const coverage: Record<string, Coverage> = {};

  const pages = await fetchEach(coverage, "pages", ids("Page", "page_url"), async (slug) => {
    const page = await client.get<CanvasPage>(`${base}/pages/${encodeURIComponent(slug)}`);
    return {
      title: page.title ?? null,
      content: htmlToMarkdown(page.body, client.baseUrl),
      updated_at: page.updated_at ?? null,
      published: page.published ?? null,
      url: page.html_url || `${client.baseUrl}/courses/${courseId}/pages/${slug}`,
    };
  });
  const quizzes = await fetchEach(coverage, "quizzes", ids("Quiz", "content_id"), async (id) => {
    const quiz = await client.get<CanvasQuiz>(`${base}/quizzes/${id}`);
    return {
      title: quiz.title ?? null,
      question_count: quiz.question_count ?? null,
      time_limit: quiz.time_limit ?? null,
      points_possible: quiz.points_possible ?? null,
      description: htmlToMarkdown(quiz.description, client.baseUrl),
      url: quiz.html_url ?? null,
    };
  });
  const discussions = await fetchEach(coverage, "discussions", ids("Discussion", "content_id"), async (id) => {
    const topic = await client.get<CanvasTopic>(`${base}/discussion_topics/${id}`);
    return { title: topic.title ?? null, message: htmlToMarkdown(topic.message, client.baseUrl), url: topic.html_url ?? null };
  });
  // Slides and readings are named, but what's in them isn't read.
  if (items.some((i) => i.type === "File")) coverage["file contents"] = { status: "not read" };

  return { pages, quizzes, discussions, coverage };
}

interface CanvasPage {
  title?: string | null;
  body?: string | null;
  updated_at?: string | null;
  published?: boolean | null;
  html_url?: string | null;
}

interface CanvasQuiz {
  title?: string | null;
  description?: string | null;
  question_count?: number | null;
  time_limit?: number | null;
  points_possible?: number | null;
  html_url?: string | null;
}

interface CanvasTopic {
  title?: string | null;
  message?: string | null;
  html_url?: string | null;
}

/** One request per key, a few at a time. Failures are left out and noted under `name` in coverage. */
async function fetchEach<T>(
  coverage: Record<string, Coverage>,
  name: string,
  keys: string[],
  fetchOne: (key: string) => Promise<T>,
): Promise<Map<string, T>> {
  const found = new Map<string, T>();
  const failed: CanvasError[] = [];
  await mapLimit(keys, MAX_WORKERS, async (key) => {
    try {
      found.set(key, await fetchOne(key));
    } catch (error) {
      if (!(error instanceof CanvasError) || error.badToken) throw error;
      failed.push(error);
    }
  });
  if (failed.length > 0) {
    coverage[name] = found.size > 0
      ? { status: "partial", note: `${failed.length} of ${keys.length} couldn't be read` }
      : coverageOf(failed[0]);
  }
  return found;
}

// ------------------------------------------------------------ render.py's helpers

const HEADING = /^(#{1,6})(\s+\S)/;
const FENCE = /^\s*(```|~~~)/;

/**
 * Pushes a body's own headings below the ones around it, so its shallowest sits
 * at `floor` and the structure inside it stays the same. Canvas pages start
 * their headings wherever the author felt like.
 */
function demote(markdown: string, floor: number): string {
  const lines = markdown.split(/\r?\n/);
  let fenced = false;
  const levels: number[] = [];
  for (const line of lines) {
    if (FENCE.test(line)) fenced = !fenced;
    else if (!fenced) {
      const match = HEADING.exec(line);
      if (match) levels.push(match[1].length);
    }
  }
  if (levels.length === 0) return markdown;
  const shift = floor - Math.min(...levels);
  if (shift <= 0) return markdown;

  fenced = false;
  return lines
    .map((line) => {
      if (FENCE.test(line)) {
        fenced = !fenced;
        return line;
      }
      const match = fenced ? null : HEADING.exec(line);
      return match ? "#".repeat(Math.min(6, match[1].length + shift)) + line.slice(match[1].length) : line;
    })
    .join("\n");
}

function table(headers: string[], rows: (string | number | null)[][]): string[] {
  if (rows.length === 0) return [];
  const clean = (cell: string | number | null) =>
    String(cell ?? "—").replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|");
  return [
    `| ${headers.join(" | ")} |`,
    `| ${headers.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.map(clean).join(" | ")} |`),
  ];
}

/** Marking criteria as a table, the rating bands lined up as columns. */
function rubricLines(rubric: RubricCriterion[]): string[] {
  if (rubric.length === 0) return [];
  const bands: string[] = [];
  for (const criterion of rubric) {
    for (const rating of criterion.ratings) {
      if (rating.label && !bands.includes(rating.label)) bands.push(rating.label);
    }
  }
  const rows = rubric.map((criterion) => {
    const byLabel = new Map(criterion.ratings.map((r) => [r.label, r]));
    return [criterion.criterion, criterion.points, ...bands.map((band) => byLabel.get(band)?.detail || "")];
  });
  const lines = ["", "**Marking criteria**", "", ...table(["Criterion", "Marks", ...bands], rows)];
  const details = rubric.filter((c) => c.detail).map((c) => `- **${c.criterion}** — ${c.detail}`);
  if (details.length > 0) lines.push("", ...details);
  return lines;
}

function assessmentLines(assessment: Assessment, timezone: string): string[] {
  const lines = ["", `### ${assessment.name ?? "Untitled"}`, ""];
  const facts: string[] = [];
  if (assessment.weight_pct !== null) facts.push(`worth ${assessment.weight_pct}%`);
  const due = localTime(assessment.due_at, timezone);
  if (due) facts.push(`due ${due}`);
  if (assessment.is_group_work) facts.push("group work");
  const kinds = assessment.submission_types.filter((k) => k !== "none");
  if (kinds.length > 0) facts.push(`submit as ${kinds.join(", ")}`);
  if (facts.length > 0) lines.push(`_${facts.join("; ")}_`, "");

  const brief = assessment.brief.trim();
  if (brief) {
    lines.push(demote(brief, 4));
  } else {
    // Saying which kind of empty this is beats letting a model answer "there isn't one".
    const where = assessment.likely_source;
    lines.push(`_No brief in Canvas._${where.length > 0 ? ` Likely in: ${where.join("; ")}.` : ""}`);
  }
  lines.push(...rubricLines(assessment.rubric));
  return lines;
}

/** Module items on their own: a page's body inlined, a file or link named. */
function itemLines(items: ModuleItem[], pages: Map<string, Page>): string[] {
  const lines: string[] = [];
  for (const item of items) {
    const page = pages.get(item.page_url ?? "");
    const body = page?.content.trim() ?? "";
    if (page && body) lines.push("", `### ${page.title ?? item.title}`, "", demote(body, 4));
    else if (item.type === "File") lines.push(`- ${item.title}`);
    else if (item.type === "ExternalUrl" && item.external_url) lines.push(`- [${item.title}](${item.external_url})`);
  }
  return lines;
}

/**
 * The assessments a module is about: those its items name, and, failing that,
 * those sharing its week number (41129 numbers its journals by week but files
 * them under one unnumbered module).
 */
function assessmentsFor(document: SubjectDocument, module: Module): Assessment[] {
  const ids = new Set(module.items.filter((item) => item.type === "Assignment").map((item) => item.content_id));
  const week = weekLabel(module.name);
  return document.assessments.filter((a) => ids.has(a.id) || (week && weekLabel(a.name) === week));
}

/** Whether a module has anything worth reading: a page with a body, a link, or an assessment. */
function hasContent(document: SubjectDocument, module: Module, pages: Map<string, Page>): boolean {
  for (const item of module.items) {
    if (pages.get(item.page_url ?? "")?.content.trim()) return true;
    if (item.type === "ExternalUrl" && item.external_url) return true;
  }
  return assessmentsFor(document, module).length > 0;
}

/** The coverage caveat. Without it a hidden tab reads as "this subject has no readings", and a model will say so. */
function gaps(coverage: Record<string, Coverage>): string {
  const named = Object.entries(coverage)
    .filter(([, value]) => value.status !== "ok")
    .map(([key, value]) => `${key} (${value.status})`);
  return named.length > 0
    ? `_Not retrieved, so their absence above is not evidence of absence: ${named.join(", ")}._`
    : "";
}

/** "2026-08-09 23:59" in the student's timezone, as the scraper's due_at_local shows a due date. */
function localTime(stamp: string | null, timezone: string): string | null {
  if (!stamp) return null;
  const date = new Date(stamp);
  if (Number.isNaN(date.getTime())) return null;
  const options = { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  try {
    // Swedish writes dates the ISO way: 2026-08-09 23:59.
    return new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: timezone }).format(date);
  } catch {
    return new Intl.DateTimeFormat("sv-SE", { ...options, timeZone: "UTC" }).format(date);
  }
}
