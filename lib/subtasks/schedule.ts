// Puts an assessment's subtasks on the calendar: real dates and start times
// between now and the deadline, in the student's timezone. Pure (no database,
// no network), so it's tested with a fixed clock.
//
// Claude says how long each subtask takes and how many days before the
// deadline it should be finished. Everything about *when* is decided here:
//
//   - a study window each day (18:00-21:00 by default, at most 180 minutes),
//     from the student's study_preferences if they have a row (Settings ›
//     Study hours, lib/data/study-preferences);
//   - around what's already on the calendar (`busy`: other assessments'
//     subtasks, classes), with a break either side of every session, and the
//     day's study already planned counted against the daily limit;
//   - spread out: one session of an assessment a day where they fit, two
//     before any more, so a week's work doesn't land on one evening;
//   - weekdays first; weekends only when the subtasks don't fit without them;
//   - nothing before now (today's window starts at the next quarter hour) and
//     nothing after the deadline (the due day's window ends at the deadline);
//   - subtasks stay in order, each finished by its day or earlier: they're
//     placed from the last one backwards, so spill-over moves earlier, not later;
//   - if even that can't fit full-length sessions, sessions are shortened
//     (never below 15 minutes) and `tight` is set; any that still don't fit are
//     dropped and counted.

export const MIN_MINUTES = 15;
export const MAX_MINUTES = 180;
const MAX_DAYS = 120;
const QUARTER_HOUR_MS = 15 * 60_000;
/** Kept free before and after every session, between it and anything else on the calendar. */
const BREAK_MS = 15 * 60_000;
const FIVE_MINUTES_MS = 5 * 60_000;

export interface StudyPrefs {
  /** Study window, in minutes after local midnight. */
  startMinutes: number;
  endMinutes: number;
  maxDailyMinutes: number;
  /** A typical session; used when Claude gives no length. */
  sessionMinutes: number;
  /** ISO weekdays, 1 = Monday ... 7 = Sunday. */
  studyDays: number[];
}

export const DEFAULT_PREFS: StudyPrefs = {
  startMinutes: 18 * 60,
  endMinutes: 21 * 60,
  maxDailyMinutes: 180,
  sessionMinutes: 60,
  studyDays: [1, 2, 3, 4, 5],
};

/** The columns of a study_preferences row this reads. */
export interface PrefsRow {
  preferred_session_minutes: number;
  max_daily_minutes: number;
  preferred_start_time: string | null;
  preferred_end_time: string | null;
  study_days: number[] | null;
}

/** The student's preferences, with a default for anything missing or unusable. */
export function prefsFromRow(row: PrefsRow | null): StudyPrefs {
  if (!row) return DEFAULT_PREFS;
  const start = timeToMinutes(row.preferred_start_time);
  const end = timeToMinutes(row.preferred_end_time);
  const window = start !== null && end !== null && end - start >= MIN_MINUTES;
  // The schema doesn't say how days are numbered; 1-7 from Monday, with 0 read as Sunday, covers both usual ways.
  const days = (row.study_days ?? []).map((d) => (d === 0 ? 7 : d)).filter((d) => d >= 1 && d <= 7);
  return {
    startMinutes: window ? (start as number) : DEFAULT_PREFS.startMinutes,
    endMinutes: window ? (end as number) : DEFAULT_PREFS.endMinutes,
    maxDailyMinutes: row.max_daily_minutes > 0 ? row.max_daily_minutes : DEFAULT_PREFS.maxDailyMinutes,
    sessionMinutes: row.preferred_session_minutes > 0 ? row.preferred_session_minutes : DEFAULT_PREFS.sessionMinutes,
    studyDays: days.length > 0 ? days : DEFAULT_PREFS.studyDays,
  };
}

export interface PlannedSubtask {
  title: string;
  description: string;
  minutes: number;
  /** Days before the deadline it should be finished: 0 is the due day. */
  daysBeforeDue: number;
}

export interface ScheduledSubtask {
  /** 1, 2, 3... in the order to do them (after any are dropped). */
  order: number;
  title: string;
  description: string;
  minutes: number;
  start: Date;
  end: Date;
  /** The local date it falls on, YYYY-MM-DD. */
  date: string;
}

export interface Schedule {
  tasks: ScheduledSubtask[];
  /** Sessions were shortened, or some subtasks left out, to fit before the deadline. */
  tight: boolean;
  /** Subtasks that didn't fit at all. */
  dropped: number;
  /** Weekend days were needed. */
  usedWeekend: boolean;
}

/** Time already taken on the calendar, as epoch ms. */
export interface Busy {
  start: number;
  end: number;
  /** Study (another subtask), which counts towards the day's study limit; a class doesn't. */
  study: boolean;
}

export interface ScheduleOptions {
  now: Date;
  due: Date;
  timezone: string;
  prefs: StudyPrefs;
  /** What's on the calendar already, to schedule around. */
  busy?: Busy[];
}

/** One day's study window. */
interface Window {
  date: string;
  /** Epoch ms: no earlier than now, no later than the deadline. */
  start: number;
  end: number;
  /** Study minutes still allowed that day, after the study already on the calendar. */
  allowance: number;
  preferred: boolean;
}

interface Placed {
  window: number;
  start: number;
  end: number;
}

interface Placement {
  /** Where each subtask went, or null if it didn't fit. */
  placed: (Placed | null)[];
  minutes: number[];
  dropped: number;
}

export function scheduleSubtasks(planned: PlannedSubtask[], options: ScheduleOptions): Schedule {
  const { now, due, timezone } = options;
  const busy = options.busy ?? [];
  const today = localDate(now.getTime(), timezone);
  const lastDate = localDate(due.getTime(), timezone);
  const all = windowsBetween(today, lastDate, options, busy);
  if (planned.length === 0 || all.length === 0) {
    return { tasks: [], tight: false, dropped: planned.length, usedWeekend: false };
  }

  // Spread out first: one session a day on study days, then two, then weekends too, then as many as fit.
  const weekdays = all.filter((w) => w.preferred);
  const tries: { windows: Window[]; perDay: number }[] = [
    { windows: weekdays, perDay: 1 },
    { windows: weekdays, perDay: 2 },
  ];
  if (weekdays.length < all.length) tries.push({ windows: all, perDay: 1 }, { windows: all, perDay: 2 });
  tries.push({ windows: all, perDay: Infinity });

  for (const { windows, perDay } of tries) {
    if (windows.length === 0) continue;
    const placement = place(planned, planned.map((p) => p.minutes), windows, lastDate, busy, perDay);
    if (placement.dropped === 0) return finish(planned, placement, windows, false);
  }

  // Shorten every session by the same factor until they all fit.
  const capacity = all.reduce((sum, w) => sum + w.allowance, 0);
  const total = planned.reduce((sum, p) => sum + clamp(p.minutes, MIN_MINUTES, MAX_MINUTES), 0);
  let last: Placement | null = null;
  for (let factor = Math.min(1, (0.9 * capacity) / total); factor >= 0.3; factor -= 0.1) {
    last = place(planned, planned.map((p) => p.minutes * factor), all, lastDate, busy, Infinity);
    if (last.dropped === 0) return finish(planned, last, all, true);
  }
  return last ? finish(planned, last, all, true) : { tasks: [], tight: true, dropped: planned.length, usedWeekend: false };
}

/**
 * Places subtasks from the last to the first, each on its target day or
 * earlier, never after the one that follows (on its day, it ends a break
 * before it starts), at most `perDay` of them on one day. Each goes as late in
 * its day as fits, so the ones before it can still fit earlier that day; then
 * each day's sessions are moved back to the earliest free times, in order.
 */
function place(
  planned: PlannedSubtask[],
  wanted: number[],
  windows: Window[],
  lastDate: string,
  busy: Busy[],
  perDay: number,
): Placement {
  const longest = Math.max(...windows.map((w) => (w.end - w.start) / 60_000));
  const minutes = wanted.map((m) => clamp(Math.round(m / 5) * 5, MIN_MINUTES, Math.min(MAX_MINUTES, longest)));
  const taken = busy.map((b) => ({ start: b.start, end: b.end }));
  const allowance = windows.map((w) => w.allowance);
  const count = windows.map(() => 0);
  const placed: (Placed | null)[] = planned.map(() => null);
  let ceiling = windows.length - 1;
  let ceilingEnd = Infinity;

  for (let i = planned.length - 1; i >= 0; i--) {
    const target = addDays(lastDate, -Math.max(0, planned[i].daysBeforeDue));
    // The latest window on or before the target day, or the first if the target is earlier than any.
    const from = Math.min(ceiling, windows.reduce((found, w, index) => (w.date <= target ? index : found), 0));
    // Its target day and earlier first; later than its target beats not at all, if not past the next subtask.
    const order = [...range(from, 0), ...(from < ceiling ? range(from + 1, ceiling) : [])];

    for (const j of order) {
      const length = minutes[i] * 60_000;
      if (count[j] >= perDay || allowance[j] < minutes[i]) continue;
      const until = j === ceiling ? Math.min(windows[j].end, ceilingEnd) : windows[j].end;
      const start = lastFree(windows[j].start, until, length, taken);
      if (start === null) continue;
      placed[i] = { window: j, start, end: start + length };
      taken.push({ start, end: start + length });
      allowance[j] -= minutes[i];
      count[j] += 1;
      ceiling = j;
      ceilingEnd = start - BREAK_MS;
      break;
    }
  }

  // Back to the start of each day's window, in order. Taking the earliest free time in turn
  // can't fail where the latest did, and each session only moves earlier.
  const others = busy.map((b) => ({ start: b.start, end: b.end }));
  windows.forEach((w, j) => {
    const today = placed.flatMap((spot, i) => (spot?.window === j ? [i] : []));
    // Each after the one before it, so a short one can't slip into a gap ahead of it.
    let cursor = w.start;
    for (const i of today) {
      const spot = placed[i] as Placed;
      const length = spot.end - spot.start;
      const start = firstFree(cursor, spot.end, length, others) ?? spot.start;
      placed[i] = { window: j, start, end: start + length };
      others.push({ start, end: start + length });
      cursor = start + length + BREAK_MS;
    }
  });
  return { placed, minutes, dropped: placed.filter((p) => p === null).length };
}

/** The latest start, on a five-minute mark, for `length` ms between `from` and `until` with a break clear of everything taken. */
function lastFree(from: number, until: number, length: number, taken: { start: number; end: number }[]): number | null {
  const candidates = [until - length, ...taken.map((t) => t.start - BREAK_MS - length)]
    .map((c) => Math.floor(c / FIVE_MINUTES_MS) * FIVE_MINUTES_MS)
    .filter((c) => c >= from && c + length <= until)
    .sort((a, b) => b - a);
  for (const start of candidates) {
    const clear = taken.every((t) => start >= t.end + BREAK_MS || start + length + BREAK_MS <= t.start);
    if (clear) return start;
  }
  return null;
}

/** The earliest start, on a five-minute mark, for `length` ms between `from` and `until` with a break clear of everything taken. */
function firstFree(from: number, until: number, length: number, taken: { start: number; end: number }[]): number | null {
  const candidates = [from, ...taken.map((t) => t.end + BREAK_MS)]
    .map((c) => Math.ceil(c / FIVE_MINUTES_MS) * FIVE_MINUTES_MS)
    .filter((c) => c >= from && c + length <= until)
    .sort((a, b) => a - b);
  for (const start of candidates) {
    const clear = taken.every((t) => start >= t.end + BREAK_MS || start + length + BREAK_MS <= t.start);
    if (clear) return start;
  }
  return null;
}

function finish(planned: PlannedSubtask[], placement: Placement, windows: Window[], tight: boolean): Schedule {
  const tasks: ScheduledSubtask[] = [];
  planned.forEach((p, i) => {
    const spot = placement.placed[i];
    if (!spot) return;
    tasks.push({
      order: tasks.length + 1,
      title: p.title,
      description: p.description,
      minutes: placement.minutes[i],
      start: new Date(spot.start),
      end: new Date(spot.end),
      date: windows[spot.window].date,
    });
  });
  const usedWeekend = placement.placed.some((spot) => spot !== null && !windows[spot.window].preferred);
  return { tasks, tight: tight || placement.dropped > 0, dropped: placement.dropped, usedWeekend };
}

/**
 * The study window of each day from `first` to `last`, trimmed to start no
 * earlier than now and end no later than the deadline, less the study already
 * planned that day.
 */
function windowsBetween(first: string, last: string, { now, due, timezone, prefs }: ScheduleOptions, busy: Busy[]): Window[] {
  const windows: Window[] = [];
  for (let date = first, n = 0; date <= last && n < MAX_DAYS; date = addDays(date, 1), n++) {
    let start = localToInstant(date, prefs.startMinutes, timezone);
    let end = localToInstant(date, prefs.endMinutes, timezone);
    if (date === first) start = Math.max(start, Math.ceil(now.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
    if (date === last) end = Math.min(end, due.getTime());
    const studied = busy
      .filter((b) => b.study && localDate(b.start, timezone) === date)
      .reduce((sum, b) => sum + (b.end - b.start) / 60_000, 0);
    const allowance = Math.min(prefs.maxDailyMinutes - studied, Math.floor((end - start) / 60_000));
    if (allowance >= MIN_MINUTES) {
      windows.push({ date, start, end, allowance, preferred: prefs.studyDays.includes(isoWeekday(date)) });
    }
  }
  return windows;
}

/** from, from±1, ... to, either direction. */
function range(from: number, to: number): number[] {
  const step = from <= to ? 1 : -1;
  const out: number[] = [];
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i);
  return out;
}

// ---------------------------------------------------------------- dates and zones

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function timeToMinutes(time: string | null): number | null {
  const found = /^(\d{1,2}):(\d{2})/.exec(time ?? "");
  return found ? Number(found[1]) * 60 + Number(found[2]) : null;
}

/** The local date (YYYY-MM-DD) in `timezone` at this instant. */
export function localDate(ms: number, timezone: string): string {
  const p = zonedParts(ms, timezone);
  return `${p.y}-${String(p.m).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`;
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Whole days from `a` to `b` (both YYYY-MM-DD). */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 1 = Monday ... 7 = Sunday. */
export function isoWeekday(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return day === 0 ? 7 : day;
}

function zonedParts(ms: number, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(ms)
      .map((p) => [p.type, p.value]),
  );
  return { y: +parts.year, m: +parts.month, d: +parts.day, h: +parts.hour, mi: +parts.minute, s: +parts.second };
}

/** How far ahead of UTC `timezone` is at this instant, in ms. */
function offsetAt(ms: number, timezone: string): number {
  const p = zonedParts(ms, timezone);
  return Date.UTC(p.y, p.m - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000;
}

/** The instant (epoch ms) it is `minutes` after local midnight on `date` in `timezone`, daylight saving included. */
export function localToInstant(date: string, minutes: number, timezone: string): number {
  const [y, m, d] = date.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d, 0, minutes);
  const first = offsetAt(naive, timezone);
  const guess = naive - first;
  const second = offsetAt(guess, timezone);
  return second === first ? guess : naive - second;
}
