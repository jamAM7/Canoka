import Image from "next/image";
import Link from "next/link";
import { GearIcon } from "./icons";

type Section = "dashboard" | "notes" | "calendar" | "settings";

interface Props {
  active: Section;
}

const LINKS: { href: string; label: string; section: Section }[] = [
  { href: "/dashboard", label: "Dashboard", section: "dashboard" },
  { href: "/notes", label: "Notes", section: "notes" },
  { href: "/calendar", label: "Calendar", section: "calendar" },
];

// Top navigation shared by every page. Deliberately unboxed: no background,
// border or divider, so it sits directly on the page.
export function NavBar({ active }: Props) {
  return (
    <header className="flex shrink-0 items-center gap-10 px-8 py-4 md:px-10">
      <Link href="/dashboard" className="flex items-center">
        <Image src="/canoka-logo.png" alt="Canoka" width={425} height={200} priority className="nav-logo h-8 w-auto" />
      </Link>

      <nav className="flex items-center gap-7">
        {LINKS.map((l) => (
          <NavLink key={l.href} href={l.href} label={l.label} active={active === l.section} />
        ))}
      </nav>

      <div className="ml-auto">
        <NavLink href="/settings" label="Settings" icon={<GearIcon />} active={active === "settings"} />
      </div>
    </header>
  );
}

function NavLink({
  href,
  label,
  icon,
  active,
}: {
  href: string;
  label: string;
  icon?: React.ReactNode;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-2 py-1 text-[15px] font-medium transition-colors ${
        active ? "text-primary" : "text-text-muted hover:text-text"
      }`}
    >
      {icon}
      {label}
    </Link>
  );
}
