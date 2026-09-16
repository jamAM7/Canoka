"use client";

import { useEffect } from "react";
import { format } from "date-fns";
import type { CalendarEvent, Course } from "@/types/calendar";
import { formatEventTime, typeLabel } from "@/lib/calendar/event-utils";
import { isBoardCard } from "@/lib/calendar/kanban";
import { courseTone } from "@/lib/calendar/colors";
import { CardEditor, type CardEditorProps } from "./CardEditor";

type Props = Omit<CardEditorProps, "event" | "layout"> & {
  event: CalendarEvent | null;
};

// Right-hand slide-over for the week and month views. Assessments and tasks
// open the same editor as their Kanban card; classes are timetabled and have
// no card, so they get a read-only summary.
export function EventDetail({ event, ...editor }: Props) {
  const open = event !== null;
  const { onClose } = editor;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <>
      <div onClick={onClose} className={`event-detail-scrim ${open ? "" : "is-closed"}`} />
      <aside className={`event-detail-panel ${open ? "" : "is-closed"}`}>
        {event &&
          (isBoardCard(event) ? (
            <CardEditor key={event.id} layout="panel" event={event} {...editor} />
          ) : (
            <ClassDetail
              event={event}
              course={editor.courses.find((c) => c.id === event.courseId)}
              onClose={onClose}
            />
          ))}
      </aside>
    </>
  );
}

function ClassDetail({
  event,
  course,
  onClose,
}: {
  event: CalendarEvent;
  course?: Course;
  onClose: () => void;
}) {
  const tone = courseTone(course?.color);

  return (
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
        <Row label="When">
          {format(new Date(event.start), "EEEE d MMMM")}
          <br />
          {formatEventTime(event)}
        </Row>
        {course && <Row label="Course">{course.name}</Row>}
        {event.location && <Row label="Location">{event.location}</Row>}
        {event.notes && <Row label="Notes">{event.notes}</Row>}
      </div>
    </>
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
