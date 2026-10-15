"use client";

import { useRef, useState, type CSSProperties, type FormEvent } from "react";

interface Props {
  /** When it's for, e.g. "Thu 8 Oct, 6:00 – 7:00 pm". */
  when: string;
  onSave: (title: string) => void;
  onCancel: () => void;
  className?: string;
  style?: CSSProperties;
}

// The little box a new calendar event is named in, as in Apple Calendar:
// Enter adds it, Escape cancels, and clicking away keeps it if it has a name.
export function NewEventForm({ when, onSave, onCancel, className = "", style }: Props) {
  const [title, setTitle] = useState("");
  // Saving unmounts the form, and a blur can still arrive after a submit: act once.
  const done = useRef(false);
  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    if (save) onSave(title.trim() || "New event");
    else onCancel();
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    finish(true);
  };

  return (
    <form
      onSubmit={submit}
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      className={`w-56 space-y-2 rounded-lg border border-border bg-surface p-3 text-left shadow-lg ${className}`}
      style={style}
    >
      <p className="text-xs text-text-muted">{when}</p>
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") finish(false);
        }}
        onBlur={() => finish(title.trim() !== "")}
        placeholder="Event name"
        aria-label="Event name"
        className="w-full rounded-md border border-border bg-surface px-2 py-1.5 text-sm text-text focus:border-primary-light focus:outline-none"
      />
      <div className="flex gap-2">
        {/* mousedown would blur the input first, and the blur would decide instead of the button. */}
        <button
          type="submit"
          onMouseDown={(e) => e.preventDefault()}
          className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-on-primary hover:bg-primary-dark"
        >
          Add
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => finish(false)}
          className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-text hover:bg-surface-muted"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
