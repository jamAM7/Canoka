// Notes overview: the subjects the Canvas scraper found -> their notes.
// TODO: per-week notes, and load/save notes via `subjects` + `notes` in Supabase.
import { Sidebar } from "@/components/shell/Sidebar";
import { NotesContent } from "@/components/notes/NotesContent";
import { loadSubjects } from "@/lib/scraper/subjects";

export const metadata = { title: "Notes · Canoka" };

// Read the scraper's output on every request, so a new scrape shows up on reload.
export const dynamic = "force-dynamic";

export default async function NotesPage() {
  const subjects = await loadSubjects();

  return (
    <div className="app-shell">
      <Sidebar active="notes" />
      <main className="main">
        <NotesContent subjects={subjects} />
      </main>
    </div>
  );
}
