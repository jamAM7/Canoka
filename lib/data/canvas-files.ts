import "server-only";
import { CanvasError, mapLimit, type CanvasClient } from "@/lib/canvas/client";
import { readCanvasFile, type FileRead, type FileText, type KnownFile } from "@/lib/canvas/files";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dbError } from "./db-error";

// The text of the Canvas files a sync finds (lecture slides, readings,
// briefs), in canvas_files, so the AI review can read them. Each file is read
// once (lib/canvas/files): later syncs see it's already there and skip it.
// Canvas gives a changed file a new id, so stored text never goes stale.
// Files belong to a course, not a student, so one read serves everyone in it.
//
//   pending  found, not read yet
//   read     `text` holds what's in it
//   empty    nothing to read in it (a scan with no text, say)
//   skipped  not a document, too big, or Canvas won't serve it: `note` says which
//   failed   reading it went wrong; tried again on later syncs, up to ATTEMPTS times

const ATTEMPTS = 3;
/** Files read at once. Each can be a 20 MB PDF in memory. */
const AT_ONCE = 2;
/** Files looked at per call, at most. The time budget usually stops it first. */
const BATCH = 40;
const CHUNK = 500;
/** A file still to read: never tried, or failed fewer than ATTEMPTS times. */
const WAITING = `status.eq.pending,and(status.eq.failed,attempts.lt.${ATTEMPTS})`;

export interface ReadProgress {
  read: number;
  skipped: number;
  failed: number;
  /** Files still waiting in the student's subjects after this call. */
  remaining: number;
}

/** Notes files a subject points at. Files already known, read or not, are left as they are. */
export async function registerFiles(courseId: string, files: KnownFile[]): Promise<void> {
  const rows = files.map((f) => ({ course_id: courseId, external_file_id: f.id, name: f.name }));
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabaseAdmin()
      .from("canvas_files")
      .upsert(rows.slice(i, i + CHUNK), { onConflict: "course_id,external_file_id", ignoreDuplicates: true });
    if (error) throw dbError("Couldn't note the subject's files", error);
  }
}

/** What's stored for these files of a course, by Canvas file id. */
export async function storedFiles(courseId: string, ids: string[]): Promise<Map<string, FileText>> {
  const found = new Map<string, FileText>();
  if (ids.length === 0) return found;
  const { data, error } = await supabaseAdmin()
    .from("canvas_files")
    .select("external_file_id, name, status, text, note")
    .eq("course_id", courseId)
    .in("external_file_id", ids)
    .overrideTypes<(FileText & { external_file_id: string })[], { merge: false }>();
  if (error) throw dbError("Couldn't load the week's files", error);
  for (const row of data) found.set(row.external_file_id, { name: row.name, status: row.status, text: row.text, note: row.note });
  return found;
}

/**
 * Reads files still waiting in the student's subjects, a couple at a time,
 * and starts no new one once `budgetMs` has passed. Throws if Canvas turns the
 * token down; any other failure is recorded against the file.
 */
export async function readWaitingFiles(userId: string, client: CanvasClient, budgetMs: number): Promise<ReadProgress> {
  const started = Date.now();
  const courseIds = await activeCourseIds(userId);
  const progress: ReadProgress = { read: 0, skipped: 0, failed: 0, remaining: 0 };
  if (courseIds.length === 0) return progress;

  const { data: queue, error } = await supabaseAdmin()
    .from("canvas_files")
    .select("course_id, external_file_id, name, attempts")
    .in("course_id", courseIds)
    .or(WAITING)
    .order("created_at", { ascending: true })
    .limit(BATCH)
    .overrideTypes<{ course_id: string; external_file_id: string; name: string | null; attempts: number }[], { merge: false }>();
  if (error) throw dbError("Couldn't load the files to read", error);

  await mapLimit(queue, AT_ONCE, async (file) => {
    if (Date.now() - started > budgetMs) return;
    let result: FileRead;
    try {
      result = await readCanvasFile(client, file.external_file_id);
    } catch (error) {
      if (error instanceof CanvasError && error.badToken) throw error;
      const reason = error instanceof Error ? error.message : String(error);
      result = { status: "failed", name: null, contentType: null, sizeBytes: null, text: null, note: reason.slice(0, 300) };
    }
    const { error: saveError } = await supabaseAdmin()
      .from("canvas_files")
      .update({
        status: result.status,
        name: result.name ?? file.name,
        content_type: result.contentType,
        size_bytes: result.sizeBytes,
        text: result.text,
        note: result.note,
        attempts: file.attempts + 1,
        read_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("course_id", file.course_id)
      .eq("external_file_id", file.external_file_id);
    if (saveError) throw dbError("Couldn't save a file's text", saveError);
    if (result.status === "failed") progress.failed++;
    else if (result.status === "skipped" || result.status === "empty") progress.skipped++;
    else progress.read++;
  });

  const { count, error: countError } = await supabaseAdmin()
    .from("canvas_files")
    .select("external_file_id", { count: "exact", head: true })
    .in("course_id", courseIds)
    .or(WAITING);
  if (countError) throw dbError("Couldn't count the files left to read", countError);
  return { ...progress, remaining: count ?? 0 };
}

async function activeCourseIds(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin()
    .from("course_enrolments")
    .select("course_id")
    .eq("user_id", userId)
    .eq("status", "active")
    .overrideTypes<{ course_id: string }[], { merge: false }>();
  if (error) throw dbError("Couldn't load your subjects", error);
  return data.map((row) => row.course_id);
}
