// Notes overview: the student's subjects and weeks from Supabase -> their notes.
import { Sidebar } from "@/components/shell/Sidebar";
import { NotesContent } from "@/components/notes/NotesContent";
import { currentUser } from "@/lib/data/user";
import { getNotesOverview } from "@/lib/data/notes";

export const metadata = { title: "Notes · Canoka" };

// Read the database on every request, so a new sync or note shows up on reload.
export const dynamic = "force-dynamic";

export default async function NotesPage() {
  return (
    <div className="app-shell">
      <Sidebar active="notes" />
      <main className="main">{await content()}</main>
    </div>
  );
}

async function content() {
  try {
    const user = await currentUser();
    const { subjects, notes } = await getNotesOverview(user.id);
    return <NotesContent subjects={subjects} initialNotes={notes} />;
  } catch (error) {
    return (
      <div className="p-8 md:p-10">
        <p className="text-error">
          Couldn&apos;t load your notes: {error instanceof Error ? error.message : String(error)}
        </p>
      </div>
    );
  }
}
