// Notes overview: list of subjects -> weeks.
// TODO: subject/week list, pulled from `subjects` + `notes`.
import { MOCK_COURSES } from "@/lib/calendar/mock-data";
import { Sidebar } from "@/components/shell/Sidebar";
import { NotesContent } from "@/components/notes/NotesContent";

export const metadata = { title: "Notes · Canoka" };

export default function NotesPage() {
  return (
    <div className="app-shell">
      <Sidebar active="notes" />
      <main className="main">
        <NotesContent courses={MOCK_COURSES} />
      </main>
    </div>
  );
}
