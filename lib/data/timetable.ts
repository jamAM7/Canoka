import "server-only";
import path from "node:path";
import { readEnvFile, writeEnvFile } from "@/lib/env-file";
import { parseIcs, type IcsEvent, type IcsTime } from "@/lib/calendar/ical";
import { zonedIso } from "@/lib/data/calendar";
import type { CalendarEvent, Course } from "@/types/calendar";

// The student's classes, from the iCal subscription link UTS My Timetable
// gives. The link is TIMETABLE_ICAL_URL: saved from Settings into .env.local,
// or set in the environment (on a host, say). The feed is fetched when the
// calendar loads and kept for a few minutes, so timetable changes come through
// on their own.

const ENV_FILE = path.join(process.cwd(), ".env.local");
const KEY = "TIMETABLE_ICAL_URL";
const FRESH_MS = 10 * 60_000;
const TIMEOUT_MS = 15_000;
/** A class with a start but no end gets an hour. */
const DEFAULT_CLASS_MINUTES = 60;

let cached: { url: string; at: number; events: IcsEvent[] } | null = null;

/** The subscription link. .env.local wins once Settings has written it, so unsubscribing sticks. */
export function timetableUrl(): string | null {
  const file = readEnvFile(ENV_FILE);
  if (KEY in file) return file[KEY] || null;
  return process.env[KEY]?.trim() || null;
}

/** Subscribes to { url } from the Settings page, once it returns a calendar. Returns how many classes it has. */
export async function saveTimetableUrl(input: unknown): Promise<number> {
  const raw = (input as { url?: unknown } | null)?.url;
  const url = normalise(typeof raw === "string" ? raw : "");
  if (!url) throw new Error("That doesn't look like a calendar link. It should start with https:// or webcal://.");

  let events: IcsEvent[];
  try {
    events = await fetchFeed(url);
  } catch (error) {
    throw new Error(`Couldn't read that link: ${error instanceof Error ? error.message : String(error)}.`);
  }
  writeEnvFile(ENV_FILE, { [KEY]: url }, "Canoka's settings for this computer. Never commit this file.");
  cached = { url, at: Date.now(), events };
  return events.length;
}

export function removeTimetableUrl(): void {
  writeEnvFile(ENV_FILE, { [KEY]: "" }, "Canoka's settings for this computer. Never commit this file.");
  cached = null;
}

/**
 * The student's classes as calendar events, each on its subject when the
 * subject code matches one of `courses`. A feed that can't be read gives no
 * classes and an `error` to show, rather than failing the whole calendar.
 */
export async function getTimetableEvents(
  courses: Course[],
  timezone: string,
): Promise<{ events: CalendarEvent[]; error?: string }> {
  const url = timetableUrl();
  if (!url) return { events: [] };
  try {
    if (!cached || cached.url !== url || Date.now() - cached.at > FRESH_MS) {
      cached = { url, at: Date.now(), events: await fetchFeed(url) };
    }
    return { events: toEvents(cached.events, courses, timezone) };
  } catch (error) {
    return {
      events: [],
      error: `Couldn't load your timetable: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

function normalise(input: string): string | null {
  const text = input.trim().replace(/^webcals?:\/\//i, "https://");
  try {
    const url = new URL(text);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

async function fetchFeed(url: string): Promise<IcsEvent[]> {
  const res = await fetch(url, {
    cache: "no-store",
    headers: { Accept: "text/calendar" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`the timetable server answered ${res.status}`);
  const text = await res.text();
  if (!text.includes("BEGIN:VCALENDAR")) throw new Error("it didn't return a calendar");
  return parseIcs(text);
}

function toEvents(feed: IcsEvent[], courses: Course[], timezone: string): CalendarEvent[] {
  const courseByCode = new Map(courses.map((c) => [c.code, c.id]));
  return feed.flatMap((ev): CalendarEvent[] => {
    // The week view's grid is for times; a whole-day entry has none.
    if (ev.start.allDay) return [];
    const start = instant(ev.start, timezone);
    if (!start) return [];
    const end =
      (ev.end && !ev.end.allDay && instant(ev.end, timezone)) ||
      new Date(new Date(start).getTime() + DEFAULT_CLASS_MINUTES * 60_000).toISOString();
    const code = subjectCode(ev);
    const staff = ev.description?.match(/^Staff: (.+)$/m)?.[1].trim();
    return [
      {
        // UTS numbers its UIDs by position, so they shift when a class is added; this doesn't.
        id: `class-${start}-${ev.summary}`,
        title: ev.summary || "Class",
        type: "class",
        start,
        end,
        courseId: code ? courseByCode.get(code) : undefined,
        location: ev.location && ev.location !== "-" ? ev.location : undefined,
        notes: staff && staff !== "-" ? `Staff: ${staff}` : undefined,
      },
    ];
  });
}

/** UTS starts the description with the subject's offering, e.g. "41201_AUT_U_1_S, Tut1, 04". */
function subjectCode(ev: IcsEvent): string | undefined {
  return ev.description?.match(/^(\d{5})_/)?.[1] ?? ev.summary.match(/\b(\d{5})\b/)?.[1];
}

function instant(time: IcsTime, timezone: string): string | null {
  if (time.utc) {
    const [y, m, d] = time.date.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, time.hour, time.minute)).toISOString();
  }
  // Floating times, and zones Intl doesn't know (Windows names, say), are the student's own.
  const zone = time.tzid && knownZone(time.tzid) ? time.tzid : timezone;
  return zonedIso(time.date, time.hour, zone, time.minute);
}

function knownZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}
