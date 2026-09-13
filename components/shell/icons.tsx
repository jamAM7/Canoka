// Small stroke icons for the app shell. Plain inline SVG so the shell has no
// icon-library dependency — currentColor throughout so they inherit nav/button color.

type IconProps = { className?: string };

const base = {
  width: 18,
  height: 18,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function NotesIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="4" y="3.5" width="16" height="17" rx="2" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

export function DashboardIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="3.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13" y="3.5" width="7.5" height="4.5" rx="1.5" />
      <rect x="13" y="10.5" width="7.5" height="10" rx="1.5" />
      <rect x="3.5" y="13.5" width="7.5" height="7" rx="1.5" />
    </svg>
  );
}

export function CalendarIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M3.5 9.5h17M8 3v3M16 3v3" />
    </svg>
  );
}

export function GearIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2.4M12 18.1v2.4M20.5 12h-2.4M5.9 12H3.5M17.7 6.3l-1.7 1.7M8 16l-1.7 1.7M17.7 17.7L16 16M8 8 6.3 6.3" />
    </svg>
  );
}

export function ChevronIcon({ className, dir = "left" }: IconProps & { dir?: "left" | "right" }) {
  return (
    <svg {...base} width={16} height={16} className={className} aria-hidden="true">
      <path d={dir === "left" ? "M14.5 5.5 9 12l5.5 6.5" : "M9.5 5.5 15 12l-5.5 6.5"} />
    </svg>
  );
}
