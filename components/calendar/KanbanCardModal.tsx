"use client";

import { useEffect } from "react";
import type { CalendarEvent } from "@/types/calendar";
import { CardEditor, type CardEditorProps } from "./CardEditor";

type Props = Omit<CardEditorProps, "event" | "layout"> & {
  event: CalendarEvent | null;
};

// The Kanban board's card editor, shown as a modal over the board.
export function KanbanCardModal({ event, ...editor }: Props) {
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

  if (!event) return null;

  return (
    <div
      className="fixed inset-0 z-50 overflow-y-auto bg-text/40 p-4 md:p-10"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={event.title}
        className="mx-auto w-full max-w-3xl rounded-xl bg-surface shadow-lg"
      >
        <CardEditor key={event.id} layout="modal" event={event} {...editor} />
      </div>
    </div>
  );
}
