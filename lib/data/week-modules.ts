import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import { groupWeeks, type WeekGroup, type WeekModule } from "@/lib/notes/weeks";
import { dbError } from "./db-error";

// Which course_modules rows make up a week of a subject. A week has one
// module, the real Canvas one if there is one, else a synthetic placeholder
// (lib/notes/weeks), but code that reads or writes a week shouldn't assume
// that: it goes through here.
//
//   Reading a week (the AI review): take the notes and the course_content
//   whose module_id is in `moduleIds` for (course, week). Never one module id:
//   a leftover duplicate would hide half the week.
//
//   Writing a week's content: every item of the week goes under
//   `canonical.id`, including items found inside a numbered module that isn't
//   the canonical one, so a week's content ends up under one module.

/** Every week of a subject that has a module, each once, by week number. */
export async function courseWeeks(courseId: string): Promise<Map<number, WeekGroup>> {
  const { data, error } = await supabaseAdmin()
    .from("course_modules")
    .select("id, external_module_id, name, position, week_number, created_at")
    .eq("course_id", courseId)
    .overrideTypes<WeekModule[], { merge: false }>();
  if (error) throw dbError("Couldn't load the subject's weeks", error);
  return groupWeeks(data);
}

/** One week's modules, or null if the subject has none for it (it hasn't been synced, or has no such week). */
export async function weekModules(courseId: string, week: number): Promise<WeekGroup | null> {
  return (await courseWeeks(courseId)).get(week) ?? null;
}

/** Every module id for the week: what to match `notes.module_id` and `course_content.module_id` against. */
export async function weekModuleIds(courseId: string, week: number): Promise<string[]> {
  return (await weekModules(courseId, week))?.modules.map((m) => m.id) ?? [];
}
