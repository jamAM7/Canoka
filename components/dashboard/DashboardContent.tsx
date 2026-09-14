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
    <>
      <div className="dashboard-header">
        <h1 className="heading-2">
          {getGreeting(now)}, {CURRENT_USER.name}! 👋
        </h1>
        <p className="text-muted">Here&apos;s what&apos;s on your plate today.</p>
      </div>

      <div className="dashboard-content">
        <div className="dashboard-columns">
          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Due this week</h2>
                <p className="card-description">
                  {format(weekStart, "MMM d")} – {format(weekEnd, "MMM d")}
                </p>
              </div>
              <Link href="/calendar" className="btn btn-ghost btn-small">
                View calendar
              </Link>
            </div>

            {dueThisWeek.length === 0 ? (
              <p className="empty-state" style={{ padding: "var(--space-8) 0" }}>
                Nothing due this week.
              </p>
            ) : (
              <div className="deadline-list">
                {dueThisWeek.map((ev) => {
                  const course = ev.courseId ? courseById.get(ev.courseId) : undefined;
                  const tone = courseTone(course?.color);
                  const due = new Date(ev.dueDate!);
                  const overdue = isPast(due) && ev.status !== "done";
                  return (
                    <div key={ev.id} className="deadline-row">
                      <div className="deadline-main">
                        <span className="deadline-dot" style={{ background: tone.solid }} />
                        <div className="deadline-text">
                          <div className="deadline-title">{ev.title}</div>
                          {course && <div className="deadline-course">{course.code}</div>}
                        </div>
                      </div>
                      <span className={`badge ${overdue ? "badge-error" : "badge-warning"}`}>
                        {relativeDueLabel(due, now)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <h2 className="card-title">Notifications</h2>
                <p className="card-description">Overdue or due within 48 hours.</p>
              </div>
            </div>

            {notifications.length === 0 ? (
              <p className="empty-state" style={{ padding: "var(--space-8) 0" }}>
                You&apos;re all caught up.
              </p>
            ) : (
              <div className="notification-list">
                {notifications.map((ev) => {
                  const due = new Date(ev.dueDate!);
                  const overdue = isPast(due);
                  const course = ev.courseId ? courseById.get(ev.courseId) : undefined;
                  const tone = courseTone(course?.color);
                  return (
                    <div key={ev.id} className="notification-row">
                      <span
                        className={`notification-icon ${overdue ? "overdue" : "soon"}`}
                        style={overdue ? undefined : { background: tone.bg, color: tone.fg }}
                      >
                        {overdue ? "!" : "⏱️"}
                      </span>
                      <div className="notification-text">
                        <div className="notification-title">{ev.title}</div>
                        <div className="notification-meta">
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

        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">Your subjects</h2>
              <p className="card-description">Quick links into each subject's notes.</p>
            </div>
          </div>

          <div className="subject-links">
            {courses.map((course) => {
              const tone = courseTone(course.color);
              return (
                <Link key={course.id} href="/notes" className="subject-link">
                  <span className="subject-link-dot" style={{ background: tone.solid }} />
                  {course.code} · {course.name}
                </Link>
              );
            })}
          </div>
        </section>
      </div>
    </>
  );
}
