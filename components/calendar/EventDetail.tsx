"use client";

import { format } from "date-fns";
import type { CalendarEvent, Course, TaskStatus } from "@/types/calendar";
import {
  STATUS_META,
  STATUS_ORDER,
  formatEventTime,
  rescheduleEvent,
  typeLabel,
} from "@/lib/calendar/event-utils";
import { courseTone } from "@/lib/calendar/colors";

interface Props {
  event: CalendarEvent | null;
  course?: Course;
  parent: CalendarEvent | null;
  subtasks: CalendarEvent[];
  onClose: () => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onReschedule: (id: string, start: string, end: string) => void;
  onSelect: (id: string) => void;
}

// Classes are timetabled and assessment due dates come from Canvas, so only
// tasks (including AI-generated subtasks) can be moved by the student.
function canEditSchedule(ev: CalendarEvent): boolean {
  return ev.type === "task";
}

export function EventDetail({
  event,
  course,
  parent,
  subtasks,
  onClose,
  onStatusChange,
  onReschedule,
  onSelect,
}: Props) {
  const open = event !== null;
  const tone = courseTone(course?.color);

  return (
    <>
      <div onClick={onClose} className={`event-detail-scrim ${open ? "" : "is-closed"}`} />
      <aside className={`event-detail-panel ${open ? "" : "is-closed"}`}>
        {event && (
          <>
            <div className="event-detail-header">
              <div>
                <span
                  className="badge"
                  style={{ background: tone.bg, color: tone.fg, textTransform: "uppercase", fontSize: 11 }}
                >
                  {course ? `${course.code} · ` : ""}
                  {typeLabel(event)}
                </span>
                <h2 className="heading-4" style={{ marginTop: "var(--space-2)", marginBottom: 0 }}>
                  {event.title}
                </h2>
              </div>
              <button onClick={onClose} aria-label="Close" className="icon-btn">
                ✕
              </button>
            </div>

            <div className="cb-scroll event-detail-body text-small">
              <div>
                <p className="text-xs text-light" style={{ fontWeight: 600, textTransform: "uppercase", marginBottom: "var(--space-1)" }}>
                  When
                </p>
                {canEditSchedule(event) ? (
                  <ScheduleEditor event={event} onReschedule={onReschedule} />
                ) : (
                  <p>
                    {format(new Date(event.start), "EEEE d MMMM")}
                    <br />
                    {formatEventTime(event)}
                  </p>
                )}
              </div>

              {course && <Row label="Course">{course.name}</Row>}
              {event.location && <Row label="Location">{event.location}</Row>}

              {event.dueDate && (
                <Row label="Due">
                  {format(new Date(event.dueDate), "EEEE d MMMM, h:mm a")}
                </Row>
              )}

              {event.notes && <Row label="Notes">{event.notes}</Row>}

              {parent && (
                <Row label="Part of">
                  <button
                    onClick={() => onSelect(parent.id)}
                    className="text-primary text-bold"
                    style={{ background: "none", border: 0, padding: 0 }}
                  >
                    {parent.title}
                  </button>
                </Row>
              )}

              {event.status && (
                <div>
                  <p className="text-xs text-light" style={{ fontWeight: 600, textTransform: "uppercase", marginBottom: "var(--space-2)" }}>
                    Status
                  </p>
                  <div className="status-picker">
                    {STATUS_ORDER.map((s) => (
                      <button
                        key={s}
                        onClick={() => onStatusChange(event.id, s)}
                        className={`status-chip ${event.status === s ? "active" : ""}`}
                      >
                        {STATUS_META[s].label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {subtasks.length > 0 && (
                <div>
                  <p className="text-xs text-light" style={{ fontWeight: 600, textTransform: "uppercase", marginBottom: "var(--space-1)" }}>
                    Subtasks ({subtasks.filter((t) => t.status === "done").length}/
                    {subtasks.length})
                  </p>
                  <p className="text-xs text-light" style={{ marginBottom: "var(--space-2)" }}>
                    Adjust any subtask&apos;s date or time to fit your schedule.
                  </p>
                  <ul className="stack-sm" style={{ listStyle: "none", padding: 0, margin: 0 }}>
                    {subtasks.map((t) => (
                      <li key={t.id} className="subtask-row">
                        <div className="subtask-row-main">
                          <input
                            type="checkbox"
                            className="checkbox-input"
                            checked={t.status === "done"}
                            onChange={() =>
                              onStatusChange(
                                t.id,
                                t.status === "done" ? "todo" : "done",
                              )
                            }
                          />
                          <button
                            onClick={() => onSelect(t.id)}
                            className={`subtask-title ${t.status === "done" ? "is-done" : ""}`}
                          >
                            {t.title}
                          </button>
                        </div>
                        <div className="subtask-editor">
                          <ScheduleEditor
                            event={t}
                            onReschedule={onReschedule}
                            compact
                          />
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

function ScheduleEditor({
  event,
  onReschedule,
  compact = false,
}: {
  event: CalendarEvent;
  onReschedule: (id: string, start: string, end: string) => void;
  compact?: boolean;
}) {
  const start = new Date(event.start);
  const end = new Date(event.end);

  const commit = (fields: {
    date?: string;
    startTime?: string;
    endTime?: string;
  }) => {
    const next = rescheduleEvent(event, fields);
    onReschedule(event.id, next.start, next.end);
  };

  return (
    <div className={compact ? "compact-inputs" : "stack-sm"}>
      <input
        type="date"
        value={format(start, "yyyy-MM-dd")}
        onChange={(e) => commit({ date: e.target.value })}
        className="input"
        style={compact ? undefined : { width: "100%" }}
      />
      <div className="flex align-center gap-xs">
        <input
          type="time"
          value={format(start, "HH:mm")}
          onChange={(e) => commit({ startTime: e.target.value })}
          className="input"
        />
        <span className="text-light">–</span>
        <input
          type="time"
          value={format(end, "HH:mm")}
          onChange={(e) => commit({ endTime: e.target.value })}
          className="input"
        />
      </div>
    </div>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-xs text-light" style={{ fontWeight: 600, textTransform: "uppercase", marginBottom: 2 }}>
        {label}
      </p>
      <p style={{ margin: 0 }}>{children}</p>
    </div>
  );
}
