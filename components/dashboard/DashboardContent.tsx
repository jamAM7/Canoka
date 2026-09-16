import Link from "next/link";
import { endOfWeek, format, isPast, isWithinInterval, startOfWeek } from "date-fns";
import type { CalendarEvent, Course } from "@/types/calendar";
import { WEEK_OPTS, relativeDueLabel } from "@/lib/calendar/event-utils";
import { courseTone } from "@/lib/calendar/colors";
import { CURRENT_USER, getGreeting } from "@/lib/user/mock-user";

interface Props {
  events: CalendarEvent[];
  courses: Course[];
}

// The README scopes the dashboard to exactly three things: notifications,
// "due this week", and quick links into notes. Everything here serves one of
// those — no stats, streaks, or widgets the README doesn't mention.
const URGENT_WITHIN_HOURS = 48;

export function DashboardContent({ events, courses }: Props) {
  const now = new Date();
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const assessments = events.filter(
    (ev) => ev.type === "assessment" && ev.dueDate,
  );

  const weekStart = startOfWeek(now, WEEK_OPTS);
  const weekEnd = endOfWeek(now, WEEK_OPTS);

  const dueThisWeek = assessments
    .filter((ev) => isWithinInterval(new Date(ev.dueDate!), { start: weekStart, end: weekEnd }))
    .sort((a, b) => +new Date(a.dueDate!) - +new Date(b.dueDate!));

  const notifications = assessments
    .filter((ev) => ev.status !== "done")
    .filter((ev) => {
      const due = new Date(ev.dueDate!);
      const hoursAway = (+due - +now) / 3_600_000;
      return hoursAway < URGENT_WITHIN_HOURS;
    })
    .sort((a, b) => +new Date(a.dueDate!) - +new Date(b.dueDate!))
    .slice(0, 5);

  return (
    <div className="space-y-6 p-8 md:p-10">
      <header className="px-2 pt-2">
        <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">
          {getGreeting(now)}, {CURRENT_USER.name}! 👋
        </h1>
        <p className="mt-2 text-base text-text-muted">Here&apos;s what&apos;s on your plate today.</p>
      </header>

      <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-text">Due this week</h2>
                <p className="mt-1 text-sm text-text-muted">
                  {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
                </p>
              </div>
              <Link
                href="/calendar"
                className="inline-flex items-center rounded-md border border-border bg-surface px-3 py-2 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted"
              >
                View calendar
              </Link>
            </div>

            {dueThisWeek.length === 0 ? (
              <p className="py-8 text-sm text-text-muted">Nothing due this week.</p>
            ) : (
              <div className="space-y-0">
                {dueThisWeek.map((ev) => {
                  const course = ev.courseId ? courseById.get(ev.courseId) : undefined;
                  const tone = courseTone(course?.color);
                  const due = new Date(ev.dueDate!);
                  const overdue = isPast(due) && ev.status !== "done";
                  return (
                    <div
                      key={ev.id}
                      className="flex items-center justify-between gap-3 border-b border-border-light py-3 last:border-b-0"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.solid }} />
                        <div className="min-w-0">
                          <div className="truncate font-semibold text-text">{ev.title}</div>
                          {course && <div className="text-sm text-text-muted">{course.code}</div>}
                        </div>
                      </div>

                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          overdue ? "bg-error/10 text-error" : "bg-warning/20 text-text"
                        }`}
                      >
                        {relativeDueLabel(due, now)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <div className="mb-4">
              <h2 className="text-xl font-semibold text-text">Notifications</h2>
              <p className="mt-1 text-sm text-text-muted">Overdue or due within 48 hours.</p>
            </div>

            {notifications.length === 0 ? (
              <p className="py-8 text-sm text-text-muted">You&apos;re all caught up.</p>
            ) : (
              <div className="space-y-0">
                {notifications.map((ev) => {
                  const due = new Date(ev.dueDate!);
                  const overdue = isPast(due);
                  const course = ev.courseId ? courseById.get(ev.courseId) : undefined;
                  const tone = courseTone(course?.color);
                  return (
                    <div
                      key={ev.id}
                      className="flex items-start gap-3 border-b border-border-light py-3 last:border-b-0"
                    >
                      <span
                        className={`grid h-8 w-8 place-items-center rounded-full text-xs font-semibold ${
                          overdue ? "bg-red-100 text-error" : "text-text"
                        }`}
                        style={overdue ? undefined : { background: tone.bg, color: tone.fg }}
                      >
                        {overdue ? "!" : "⏱️"}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-text">{ev.title}</div>
                        <div className="text-sm text-text-muted">
                          {course ? `${course.code} · ` : ""}
                          {relativeDueLabel(due, now)}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="text-xl font-semibold text-text">Your subjects</h2>
            <p className="mt-1 text-sm text-text-muted">Quick links into each subject&apos;s notes.</p>
          </div>

          <div className="flex flex-wrap gap-3">
            {courses.map((course) => {
              const tone = courseTone(course.color);
              return (
                <Link
                  key={course.id}
                  href="/notes"
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary-light hover:bg-surface-muted"
                >
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: tone.solid }} />
                  {course.code} · {course.name}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
