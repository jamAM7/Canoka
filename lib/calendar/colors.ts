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
    bg: "rgb(var(--rgb-info) / 0.30)",
    border: "rgb(var(--rgb-info) / 0.65)",
    fg: "var(--color-primary)",
  },
  violet: {
    solid: "var(--color-accent)",
    bg: "rgb(var(--rgb-accent) / 0.16)",
    border: "rgb(var(--rgb-accent) / 0.5)",
    fg: "var(--course-violet-fg)",
  },
  emerald: {
    solid: "var(--color-success)",
    bg: "rgb(var(--rgb-success) / 0.16)",
    border: "rgb(var(--rgb-success) / 0.5)",
    fg: "var(--color-success)",
  },
  amber: {
    solid: "var(--color-secondary)",
    bg: "rgb(var(--rgb-secondary) / 0.22)",
    border: "rgb(var(--rgb-secondary) / 0.6)",
    fg: "var(--course-amber-fg)",
  },
  rose: {
    solid: "var(--color-error)",
    bg: "rgb(var(--rgb-error) / 0.16)",
    border: "rgb(var(--rgb-error) / 0.5)",
    fg: "var(--color-error)",
  },
  cyan: {
    solid: "var(--color-accent-muted)",
    bg: "rgb(var(--rgb-accent-muted) / 0.4)",
    border: "rgb(var(--rgb-accent-muted) / 0.8)",
    fg: "var(--course-cyan-fg)",
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
