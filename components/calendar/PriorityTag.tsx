import type { TaskPriority } from "@/types/calendar";
import { PRIORITY_META } from "@/lib/calendar/kanban";

// Kept in a component file (not lib/) so Tailwind's content scan sees the classes.
export const PRIORITY_STYLES: Record<TaskPriority, string> = {
  low: "bg-success/15 text-success",
  medium: "bg-warning/30 text-text",
  high: "bg-error/15 text-error",
};

export function PriorityTag({
  priority,
  className = "",
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${PRIORITY_STYLES[priority]} ${className}`}
    >
      {PRIORITY_META[priority].label}
    </span>
  );
}
