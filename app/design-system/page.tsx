// Reference page for the Tailwind theme in tailwind.config.ts. Not linked from
// the sidebar; open /design-system directly.
export const metadata = { title: "Design system · Canoka" };

export default function DesignSystemPage() {
  return (
    <main className="min-h-screen bg-background p-10 text-text">
      <div className="mx-auto max-w-5xl space-y-10">
        <section>
          <p className="mb-2 text-sm font-medium uppercase tracking-[0.2em] text-text-muted">
            Design system
          </p>
          <h1 className="text-4xl font-bold text-primary">Canoka</h1>
          <p className="mt-3 max-w-xl text-lg text-text-muted">
            Minimal, calm, product-focused styling built from the Tailwind theme.
          </p>
        </section>

        <section className="grid gap-4 md:grid-cols-5">
          {[
            ["primary", "bg-primary"],
            ["secondary", "bg-secondary"],
            ["accent", "bg-accent"],
            ["surface", "bg-surface border border-border"],
            ["text-muted", "bg-text-muted"],
          ].map(([name, className]) => (
            <div key={name} className="space-y-2">
              <div className={`h-20 rounded-lg ${className}`} />
              <p className="text-sm text-text-muted">{name}</p>
            </div>
          ))}
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-text">Buttons</h2>
          <div className="flex flex-wrap gap-4">
            <button className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-white">
              Primary
            </button>
            <button className="rounded-md bg-secondary px-4 py-2 text-sm font-medium text-text">
              Secondary
            </button>
            <button className="rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text">
              Secondary outline
            </button>
          </div>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold text-text">Typography</h2>
          <div className="space-y-2">
            <p className="text-xs text-text-muted">Text xs</p>
            <p className="text-sm text-text-muted">Text sm</p>
            <p className="text-base text-text">Text base</p>
            <p className="text-lg text-text">Text lg</p>
            <p className="text-2xl font-semibold text-primary">Heading 2xl</p>
            <p className="text-4xl font-bold text-text">Heading 4xl</p>
          </div>
        </section>
      </div>
    </main>
  );
}
