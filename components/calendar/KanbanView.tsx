"use client";

import { useState } from "react";
import { format, isPast } from "date-fns";
import type { CalendarEvent, Course, TaskStatus } from "@/types/calendar";
import {
  STATUS_META,
  STATUS_ORDER,
  typeLabel,
} from "@/lib/calendar/event-utils";
import { courseTone } from "@/lib/calendar/colors";

interface Props {
  events: CalendarEvent[];
  courseById: Map<string, Course>;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: TaskStatus) => void;
}

// The board only shows actionable work: assessments and tasks. Classes have no
// status and are left to the week/month views.
export function KanbanView({
  events,
  courseById,
  onSelect,
  onStatusChange,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overCol, setOverCol] = useState<TaskStatus | null>(null);

  const board = events.filter(
    (ev) => ev.type === "assessment" || ev.type === "task",
  );

  return (
    <div className="cb-scroll kanban kanban-4up" style={{ overflowX: "auto" }}>
      {STATUS_ORDER.map((status) => {
        const items = board
          .filter((ev) => (ev.status ?? "coming_up") === status)
          .sort(
            (a, b) =>
              +new Date(a.dueDate ?? a.start) - +new Date(b.dueDate ?? b.start),
          );

        return (
          <div
            key={status}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(status);
            }}
            onDragLeave={() => setOverCol((c) => (c === status ? null : c))}
            onDrop={() => {
              if (dragId) onStatusChange(dragId, status);
              setDragId(null);
              setOverCol(null);
            }}
            className={`kanban-column ${overCol === status ? "drag-over" : ""}`}
          >
            <div className="kanban-column-header">
              <span className="kanban-column-title">{STATUS_META[status].label}</span>
              <span className="kanban-count">{items.length}</span>
            </div>

            <div className="cb-scroll kanban-list">
              {items.map((ev) => (
                <KanbanCard
                  key={ev.id}
                  event={ev}
                  course={
                    ev.courseId ? courseById.get(ev.courseId) : undefined
                  }
                  dragging={dragId === ev.id}
                  onDragStart={() => setDragId(ev.id)}
                  onDragEnd={() => {
                    setDragId(null);
                    setOverCol(null);
                  }}
                  onClick={() => onSelect(ev.id)}
                />
              ))}
              {items.length === 0 && (
                <p className="kanban-empty">Drop tasks here</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({
  event,
  course,
  dragging,
  onDragStart,
  onDragEnd,
  onClick,
}: {
  event: CalendarEvent;
  course?: Course;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onClick: () => void;
}) {
  const tone = courseTone(course?.color);
  const due = event.dueDate ? new Date(event.dueDate) : null;
  const overdue = due && event.status !== "done" && isPast(due);

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
      className={`kanban-card ${dragging ? "dragging" : ""}`}
      style={{ marginBottom: "var(--space-3)" }}
    >
      <div className="kanban-card-tags">
        <span
          className="badge"
          style={{ background: tone.bg, color: tone.fg, minHeight: 22, padding: "0 8px", fontSize: 10, textTransform: "uppercase" }}
        >
          {course?.code ?? typeLabel(event)}
        </span>
        {event.type === "assessment" && (
          <span className="text-xs text-light" style={{ fontWeight: 600, textTransform: "uppercase" }}>
            ◆ Assessment
          </span>
        )}
        {event.parentId && (
          <span className="text-xs text-light" style={{ fontWeight: 600, textTransform: "uppercase" }}>
            Subtask
          </span>
        )}
      </div>

      <p className="kanban-card-title" style={{ marginBottom: 0 }}>{event.title}</p>

      {due && (
        <p className={`kanban-card-due ${overdue ? "overdue" : ""}`}>
          {overdue ? "Overdue · " : "Due "}
          {format(due, "EEE d MMM, h:mm a")}
        </p>
      )}
    </div>
  );
}
