import "server-only";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { StudyPreferencesRow } from "@/lib/supabase/types";
import { MIN_MINUTES, prefsFromRow, type StudyPrefs } from "@/lib/subtasks/schedule";
import { dbError } from "./db-error";
import { NotesError } from "./notes";

// The student's study hours, from Settings › Study hours: the time of day AI
// subtasks go in (lib/subtasks/schedule), how much study a day at most, and on
// which days. One study_preferences row per student; with no row the
// scheduler's defaults apply (weekday evenings, 6-9 pm, up to 3 hours).

/** What Settings shows and saves. Times are "HH:MM", the student's local time. */
export interface StudyHours {
  start: string;
  end: string;
  maxDailyMinutes: number;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  studyDays: number[];
}

type PrefsFields = Pick<
  StudyPreferencesRow,
  "id" | "preferred_session_minutes" | "max_daily_minutes" | "preferred_start_time" | "preferred_end_time" | "study_days"
>;

const MAX_DAILY = 24 * 60;

/** What the scheduler works with: what's saved, with a default for anything missing. */
export async function studyPrefs(userId: string): Promise<StudyPrefs> {
  return prefsFromRow(await loadRow(userId));
}

export async function studyHours(userId: string): Promise<StudyHours> {
  return toHours(await studyPrefs(userId));
}

/**
 * Saves { start, end, maxDailyMinutes, studyDays } from Settings. The window
 * is within one day: finishing after midnight isn't something the scheduler
 * can place. Throws a NotesError to show.
 */
export async function saveStudyHours(userId: string, input: unknown): Promise<StudyHours> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const start = minutesOf(raw.start);
  const end = minutesOf(raw.end);
  if (start === null || end === null) throw new NotesError("Pick a start and a finish time.", 400);
  if (end - start < MIN_MINUTES) {
    throw new NotesError(`Finish at least ${MIN_MINUTES} minutes after you start, before midnight.`, 400);
  }
  const max = Number(raw.maxDailyMinutes);
  if (!Number.isInteger(max) || max < MIN_MINUTES || max > MAX_DAILY) {
    throw new NotesError("Pick how long you'll study a day at most.", 400);
  }
  const days = Array.from(new Set(Array.isArray(raw.studyDays) ? raw.studyDays : []))
    .filter((d): d is number => Number.isInteger(d) && d >= 1 && d <= 7)
    .sort((a, b) => a - b);
  if (days.length === 0) throw new NotesError("Pick at least one day to study on.", 400);

  const fields = {
    preferred_start_time: `${clock(start)}:00`,
    preferred_end_time: `${clock(end)}:00`,
    max_daily_minutes: max,
    study_days: days,
    updated_at: new Date().toISOString(),
  };
  const saved = await loadRow(userId);
  const db = supabaseAdmin().from("study_preferences");
  const { error } = saved
    ? await db.update(fields).eq("id", saved.id)
    : await db.insert({ user_id: userId, ...fields });
  if (error) throw dbError("Couldn't save your study hours", error);
  return { start: clock(start), end: clock(end), maxDailyMinutes: max, studyDays: days };
}

async function loadRow(userId: string): Promise<PrefsFields | null> {
  const { data, error } = await supabaseAdmin()
    .from("study_preferences")
    .select("id, preferred_session_minutes, max_daily_minutes, preferred_start_time, preferred_end_time, study_days")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .overrideTypes<PrefsFields[], { merge: false }>();
  if (error) throw dbError("Couldn't load your study hours", error);
  return data[0] ?? null;
}

function toHours(prefs: StudyPrefs): StudyHours {
  return {
    start: clock(prefs.startMinutes),
    end: clock(prefs.endMinutes),
    maxDailyMinutes: prefs.maxDailyMinutes,
    studyDays: prefs.studyDays,
  };
}

/** "18:30" -> 1110; null unless it's a time of day. */
function minutesOf(value: unknown): number | null {
  const found = /^(\d{2}):(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
  if (!found) return null;
  const [h, m] = [Number(found[1]), Number(found[2])];
  return h < 24 && m < 60 ? h * 60 + m : null;
}

/** 1110 -> "18:30". */
function clock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}
