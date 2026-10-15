import "server-only";
import type { WeekItem } from "@/lib/canvas/week";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dbError } from "./db-error";

// Saves one week of a subject's Canvas content (lib/canvas/week) as
// course_content, so the AI review can read the week from the database. Rows
// are upserted on (course_id, content_type, external_content_id), so saving a
// week twice changes nothing, and nothing already stored is deleted.

/** Rows per request. Page bodies are long. */
const CHUNK = 25;

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
