// Which week of semester a week is, so the calendar says "Week 11" the way
// Canvas modules and lecturers do, not the week of the year. Canvas leaves the
// term dates empty at UTS, so the sessions are written out here, from UTS's
// main academic calendar:
// https://www.uts.edu.au/for-students/current-students/managing-your-course/important-dates/academic-year-dates/2026-academic-year-dates
// Teaching weeks are numbered 1-12 and skip the mid-session StuVac, as Canvas's
// "Week N" modules do. Add each year's sessions when UTS publishes them. The
// Health (B) and Teacher Education (D) calendars run on other dates.

interface Session {
  name: string;
  /** Monday of teaching week 1, YYYY-MM-DD. */
  start: string;
  /** Mondays of mid-session StuVac weeks, which aren't numbered. */
  breaks: string[];
  /** Monday of the final StuVac week, the week after classes end. */
  finalStuVac: string;
  /** Last day of the final assessment period. */
  examsEnd: string;
}

const SESSIONS: Session[] = [
  { name: "Autumn 2026", start: "2026-02-16", breaks: ["2026-04-06"], finalStuVac: "2026-05-18", examsEnd: "2026-06-12" },
  { name: "Spring 2026", start: "2026-07-27", breaks: ["2026-09-21"], finalStuVac: "2026-10-26", examsEnd: "2026-11-20" },
];

export interface TeachingWeek {
  /** "Week 11", "StuVac" or "Exams". */
  label: string;
  /** e.g. "Spring 2026". */
  session: string;
}

/** The semester week starting on `monday` (YYYY-MM-DD), or null outside a session (holidays, orientation). */
export function teachingWeek(monday: string): TeachingWeek | null {
  for (const s of SESSIONS) {
    if (monday < s.start || monday > s.examsEnd) continue;
    if (monday >= s.finalStuVac) {
      return { label: monday < addWeeks(s.finalStuVac, 1) ? "StuVac" : "Exams", session: s.name };
    }
    if (s.breaks.includes(monday)) return { label: "StuVac", session: s.name };
    const week = weeksBetween(s.start, monday) + 1 - s.breaks.filter((b) => b < monday).length;
    return { label: `Week ${week}`, session: s.name };
  }
  return null;
}

const WEEK_MS = 7 * 86_400_000;

function utc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function weeksBetween(a: string, b: string): number {
  return Math.round((utc(b) - utc(a)) / WEEK_MS);
}

function addWeeks(date: string, weeks: number): string {
  return new Date(utc(date) + weeks * WEEK_MS).toISOString().slice(0, 10);
}
