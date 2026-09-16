import type { CourseColor } from "@/types/calendar";

// Course colours, expressed as design-token values (see styles/variables.css)
// instead of Tailwind classes, so every course accent stays inside the palette
// the rest of the app uses.
export interface CourseTone {
  /** Solid swatch — dots, "now" markers, filled toggles. */
  solid: string;
  /** Event block background (week view, kanban chips). */
  bg: string;
  /** Event block border. */
  border: string;
  /** Readable text/icon colour on top of `bg`. */
  fg: string;
}

const MAP: Record<CourseColor, CourseTone> = {
  blue: {
    solid: "var(--color-info)",
    bg: "rgba(142, 202, 230, 0.30)",
    border: "rgba(142, 202, 230, 0.65)",
    fg: "var(--color-primary)",
  },
  violet: {
    solid: "var(--color-accent)",
    bg: "rgba(226, 109, 92, 0.16)",
    border: "rgba(226, 109, 92, 0.5)",
    fg: "#8A3327",
  },
  emerald: {
    solid: "var(--color-success)",
    bg: "rgba(95, 138, 98, 0.16)",
    border: "rgba(95, 138, 98, 0.5)",
    fg: "var(--color-success)",
  },
  amber: {
    solid: "var(--color-secondary)",
    bg: "rgba(255, 183, 3, 0.22)",
    border: "rgba(255, 183, 3, 0.6)",
    fg: "#805A00",
  },
  rose: {
    solid: "var(--color-error)",
    bg: "rgba(201, 76, 76, 0.16)",
    border: "rgba(201, 76, 76, 0.5)",
    fg: "var(--color-error)",
  },
  cyan: {
    solid: "var(--color-accent-muted)",
    bg: "rgba(201, 203, 163, 0.4)",
    border: "rgba(201, 203, 163, 0.8)",
    fg: "#5B5D3F",
  },
};

const NEUTRAL: CourseTone = {
  solid: "var(--color-text-muted)",
  bg: "var(--color-surface-muted)",
  border: "var(--color-border)",
  fg: "var(--color-text-muted)",
};

export function courseTone(color?: CourseColor): CourseTone {
  return color ? MAP[color] : NEUTRAL;
}
