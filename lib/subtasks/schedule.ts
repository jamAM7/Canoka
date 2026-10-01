// Puts an assessment's subtasks on the calendar: real dates and start times
// between now and the deadline, in the student's timezone. Pure (no database,
// no network), so it's tested with a fixed clock.
//
// Claude says how long each subtask takes and how many days before the
// deadline it should be finished. Everything about *when* is decided here:
//
//   - a study window each day (18:00-21:00 by default, at most 180 minutes),
//     from the student's study_preferences if they have a row;
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

export interface ScheduleOptions {
  now: Date;
  due: Date;
  timezone: string;
  prefs: StudyPrefs;
}

interface Slot {
  date: string;
  /** Epoch ms of the day's first session. */
  start: number;
  minutes: number;
  preferred: boolean;
}

export function scheduleSubtasks(planned: PlannedSubtask[], options: ScheduleOptions): Schedule {
  const { now, due, timezone } = options;
  const today = localDate(now.getTime(), timezone);
  const lastDate = localDate(due.getTime(), timezone);
  const all = slotsBetween(today, lastDate, options);
  if (planned.length === 0 || all.length === 0) {
    return { tasks: [], tight: false, dropped: planned.length, usedWeekend: false };
  }

  const weekdays = all.filter((s) => s.preferred);
  const tries: { slots: Slot[]; shrink: boolean }[] = [{ slots: weekdays, shrink: false }];
  if (weekdays.length < all.length) tries.push({ slots: all, shrink: false });
  tries.push({ slots: all, shrink: true });

  let last: Placement | null = null;
  for (const { slots, shrink } of tries) {
    if (slots.length === 0) continue;
    if (!shrink) {
      const placement = place(planned, planned.map((p) => p.minutes), slots, lastDate);
      if (placement.dropped === 0) return finish(planned, placement, slots, false);
      continue;
    }
    // Shorten every session by the same factor until they all fit.
    const capacity = slots.reduce((sum, s) => sum + s.minutes, 0);
    const total = planned.reduce((sum, p) => sum + clamp(p.minutes, MIN_MINUTES, MAX_MINUTES), 0);
    for (let factor = Math.min(1, (0.9 * capacity) / total); factor >= 0.3; factor -= 0.1) {
      const placement = place(planned, planned.map((p) => p.minutes * factor), slots, lastDate);
      last = placement;
      if (placement.dropped === 0) return finish(planned, placement, slots, true);
    }
    return finish(planned, last as Placement, slots, true);
  }
  return { tasks: [], tight: true, dropped: planned.length, usedWeekend: false };
}

interface Placement {
  /** The slot index each subtask went in, or null if it didn't fit. */
  slotOf: (number | null)[];
  minutes: number[];
  dropped: number;
}

/** Places subtasks from the last to the first, each on its target day or earlier, never after the one that follows. */
function place(planned: PlannedSubtask[], wanted: number[], slots: Slot[], lastDate: string): Placement {
  const longest = Math.max(...slots.map((s) => s.minutes));
  const minutes = wanted.map((m) => clamp(Math.round(m / 5) * 5, MIN_MINUTES, Math.min(MAX_MINUTES, longest)));
  const remaining = slots.map((s) => s.minutes);
  const slotOf: (number | null)[] = planned.map(() => null);
  let ceiling = slots.length - 1;

  for (let i = planned.length - 1; i >= 0; i--) {
    const target = addDays(lastDate, -Math.max(0, planned[i].daysBeforeDue));
    // The latest slot on or before the target day, or the first slot if the target is earlier than any.
    let from = slots.reduce((found, s, index) => (s.date <= target ? index : found), 0);
    from = Math.min(from, ceiling);

    let chosen: number | null = null;
    for (let j = from; j >= 0 && chosen === null; j--) if (remaining[j] >= minutes[i]) chosen = j;
    // Earlier days are full: later than its target is better than not at all, as long as it's not past the next subtask.
    for (let j = from + 1; j <= ceiling && chosen === null; j++) if (remaining[j] >= minutes[i]) chosen = j;

    if (chosen !== null) {
      remaining[chosen] -= minutes[i];
      slotOf[i] = chosen;
      ceiling = chosen;
    }
  }
  return { slotOf, minutes, dropped: slotOf.filter((s) => s === null).length };
}

function finish(planned: PlannedSubtask[], placement: Placement, slots: Slot[], tight: boolean): Schedule {
  const tasks: ScheduledSubtask[] = [];
  const cursor = slots.map((s) => s.start);
  // Within a day the subtasks run back to back from the window's start, in order.
  planned.forEach((p, i) => {
    const j = placement.slotOf[i];
    if (j === null) return;
    const start = cursor[j];
    const end = start + placement.minutes[i] * 60_000;
    cursor[j] = end;
    tasks.push({
      order: tasks.length + 1,
      title: p.title,
      description: p.description,
      minutes: placement.minutes[i],
      start: new Date(start),
      end: new Date(end),
      date: slots[j].date,
    });
  });
  const usedWeekend = placement.slotOf.some((j) => j !== null && !slots[j].preferred);
  return { tasks, tight: tight || placement.dropped > 0, dropped: placement.dropped, usedWeekend };
}

/** The study window of each day from `first` to `last`, trimmed to start no earlier than now and end no later than the deadline. */
function slotsBetween(first: string, last: string, { now, due, timezone, prefs }: ScheduleOptions): Slot[] {
  const slots: Slot[] = [];
  for (let date = first, n = 0; date <= last && n < MAX_DAYS; date = addDays(date, 1), n++) {
    let start = localToInstant(date, prefs.startMinutes, timezone);
    let end = localToInstant(date, prefs.endMinutes, timezone);
    if (date === first) start = Math.max(start, Math.ceil(now.getTime() / QUARTER_HOUR_MS) * QUARTER_HOUR_MS);
    if (date === last) end = Math.min(end, due.getTime());
    const minutes = Math.min(prefs.maxDailyMinutes, Math.floor((end - start) / 60_000));
    if (minutes >= MIN_MINUTES) {
      slots.push({ date, start, minutes, preferred: prefs.studyDays.includes(isoWeekday(date)) });
    }
  }
  return slots;
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
