import "server-only";
import type { WeekItem } from "@/lib/canvas/week";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { CourseContentRow } from "@/lib/supabase/types";
import { dbError } from "./db-error";

// Saves one week of a subject's Canvas content (lib/canvas/week) as
// course_content, so the AI review can read the week from the database. Rows
// are upserted on (course_id, content_type, external_content_id), so saving a
// week twice changes nothing, and nothing already stored is deleted.

/** Rows per request. Page bodies are long. */
const CHUNK = 25;
const MAX_CONTENT_CHARS = 150_000;
/** Synthetic row written by scraper/week_rows.py to describe missing Canvas coverage. */
const COVERAGE_PREFIX = "canoka:coverage:";

/** Upserts a week's items under one module. */
export async function saveWeekContent(courseId: string, moduleId: string, items: WeekItem[]): Promise<void> {
  const rows = items.map((item) => ({ ...item, course_id: courseId, module_id: moduleId }));
  const db = supabaseAdmin();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await db
      .from("course_content")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "course_id,content_type,external_content_id" });
    if (error) throw dbError("Couldn't save the week's content", error);
  }
}

/** The stored text for all modules that make up one teaching week. */
export async function storedWeekContent(
  courseId: string,
  moduleIds: string[],
): Promise<{ markdown: string | null; updatedAt: string | null }> {
  const { data, error } = await supabaseAdmin()
    .from("course_content")
    .select("external_content_id, body_text, position, updated_at")
    .eq("course_id", courseId)
    .in("module_id", moduleIds)
    .order("position", { ascending: true, nullsFirst: false })
    .overrideTypes<Pick<CourseContentRow, "external_content_id" | "body_text" | "position" | "updated_at">[], { merge: false }>();
  if (error) throw dbError("Couldn't load the week's content", error);

  const updatedAt = data.reduce<string | null>(
    (latest, row) => (latest === null || Date.parse(row.updated_at) > Date.parse(latest) ? row.updated_at : latest),
    null,
  );
  const withText = data.filter((row) => row.body_text?.trim());
  if (!withText.some((row) => !row.external_content_id.startsWith(COVERAGE_PREFIX))) return { markdown: null, updatedAt };

  let markdown = withText.map((row) => (row.body_text as string).trim()).join("\n\n");
  if (markdown.length > MAX_CONTENT_CHARS) {
    markdown = `${markdown.slice(0, MAX_CONTENT_CHARS)}\n\n_The rest of this week's content was cut off to fit._`;
  }
  return { markdown, updatedAt };
}
