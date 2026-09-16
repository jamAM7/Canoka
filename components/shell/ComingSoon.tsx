// Page shell for sidebar sections that aren't built yet, so navigation never
// lands on a blank page. Replace a page's use of this once the real view exists.
import type { ComponentProps } from "react";
import { Sidebar } from "@/components/shell/Sidebar";

interface Props {
  active: ComponentProps<typeof Sidebar>["active"];
  title: string;
  description: string;
}

export function ComingSoon({ active, title, description }: Props) {
  return (
    <div className="app-shell">
      <Sidebar active={active} />
      <main className="main">
        <div className="space-y-6 p-8 md:p-10">
          <header className="px-2 pt-2">
            <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">{title}</h1>
          </header>

          <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
            <h2 className="text-xl font-semibold text-text">Coming soon</h2>
            <p className="mt-1 text-sm text-text-muted">{description}</p>
          </section>
        </div>
      </main>
    </div>
  );
}
