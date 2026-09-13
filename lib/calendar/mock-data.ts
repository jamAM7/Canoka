import {
  addDays,
  addHours,
  set,
  startOfWeek,
} from "date-fns";
import type { CalendarEvent, Course } from "@/types/calendar";

// ---------------------------------------------------------------------------
// Mock data
//
// Everything is generated relative to the current week so the calendar always
// has something to show in dev. Swap this module for a Supabase query against
// `calendar_events` when the backend is wired up.
// ---------------------------------------------------------------------------

export const MOCK_COURSES: Course[] = [
  { id: "c1", code: "31251", name: "Data Structures & Algorithms", color: "blue" },
  { id: "c2", code: "48024", name: "Applications Programming", color: "violet" },
  { id: "c3", code: "37181", name: "Discrete Mathematics", color: "emerald" },
  { id: "c4", code: "31266", name: "Introduction to Information Systems", color: "amber" },
];

/** Monday of the current week. */
const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });

function at(dayOffset: number, hour: number, minute = 0): Date {
  return set(addDays(weekStart, dayOffset), {
    hours: hour,
    minutes: minute,
    seconds: 0,
    milliseconds: 0,
  });
}

function iso(d: Date): string {
  return d.toISOString();
}

interface Draft {
  title: string;
  type: CalendarEvent["type"];
  day: number;
  start: number;
  durationH: number;
  courseId?: string;
  location?: string;
  status?: CalendarEvent["status"];
  parentId?: string;
  dueDay?: number;
  dueHour?: number;
  notes?: string;
}

const drafts: Draft[] = [
  // ----- Classes (fixed timetable) -----
  { title: "DSA Lecture", type: "class", day: 0, start: 9, durationH: 2, courseId: "c1", location: "CB11.00.401" },
  { title: "DSA Tutorial", type: "class", day: 2, start: 13, durationH: 1.5, courseId: "c1", location: "CB11.05.300" },
  { title: "Apps Programming Lecture", type: "class", day: 1, start: 11, durationH: 2, courseId: "c2", location: "CB06.02.030" },
  { title: "Apps Programming Lab", type: "class", day: 3, start: 14, durationH: 2, courseId: "c2", location: "CB11.04.200" },
  { title: "Discrete Maths Lecture", type: "class", day: 1, start: 15, durationH: 1.5, courseId: "c3", location: "CB04.03.310" },
  { title: "Discrete Maths Tutorial", type: "class", day: 4, start: 10, durationH: 1, courseId: "c3", location: "CB04.02.140" },
  { title: "Info Systems Seminar", type: "class", day: 2, start: 9, durationH: 3, courseId: "c4", location: "CB08.03.010" },

  // ----- Assessment tasks (with due dates) -----
  {
    title: "DSA Assignment 2",
    type: "assessment",
    day: 3,
    start: 16,
    durationH: 2,
    courseId: "c1",
    status: "in_progress",
    dueDay: 5,
    dueHour: 23,
    notes: "Implement and benchmark a balanced BST.",
  },
  {
    title: "Apps Programming Project — Milestone 1",
    type: "assessment",
    day: 4,
    start: 13,
    durationH: 2,
    courseId: "c2",
    status: "coming_up",
    dueDay: 9,
    dueHour: 17,
    notes: "Domain model + wireframes.",
  },
  {
    title: "Discrete Maths Quiz 3",
    type: "assessment",
    day: 2,
    start: 18,
    durationH: 1,
    courseId: "c3",
    status: "todo",
    dueDay: 6,
    dueHour: 12,
  },

  // ----- Subtasks of DSA Assignment 2 -----
  { title: "Read spec + set up repo", type: "task", day: 0, start: 17, durationH: 1, courseId: "c1", status: "done", parentId: "a1" },
  { title: "Implement insert/delete", type: "task", day: 2, start: 19, durationH: 2, courseId: "c1", status: "in_progress", parentId: "a1" },
  { title: "Write benchmark harness", type: "task", day: 3, start: 19, durationH: 1.5, courseId: "c1", status: "todo", parentId: "a1" },
  { title: "Draft report", type: "task", day: 4, start: 18, durationH: 2, courseId: "c1", status: "todo", parentId: "a1" },

  // ----- Self / AI study tasks -----
  { title: "Review lecture notes: graphs", type: "task", day: 1, start: 18, durationH: 1, courseId: "c1", status: "todo" },
  { title: "Practice past-paper questions", type: "task", day: 5, start: 10, durationH: 2, courseId: "c3", status: "coming_up" },
  { title: "Summarise readings (AI-generated)", type: "task", day: 6, start: 15, durationH: 1, courseId: "c4", status: "todo" },
  { title: "Weekly planning", type: "task", day: 0, start: 8, durationH: 0.5, status: "done" },
];

// Stable ids: assessments a1..aN in declaration order, everything else e1..eN.
let assessmentSeq = 0;
let eventSeq = 0;

export const MOCK_EVENTS: CalendarEvent[] = drafts.map((d) => {
  const start = at(d.day, Math.floor(d.start), (d.start % 1) * 60);
  const end = addHours(start, d.durationH);
  const id =
    d.type === "assessment" ? `a${++assessmentSeq}` : `e${++eventSeq}`;

  return {
    id,
    title: d.title,
    type: d.type,
    start: iso(start),
    end: iso(end),
    courseId: d.courseId,
    location: d.location,
    notes: d.notes,
    status: d.status,
    parentId: d.parentId,
    dueDate:
      d.dueDay !== undefined
        ? iso(at(d.dueDay, d.dueHour ?? 23, 59))
        : undefined,
  };
});

export function getCourse(courseId?: string): Course | undefined {
  return MOCK_COURSES.find((c) => c.id === courseId);
}
