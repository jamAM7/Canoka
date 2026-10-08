// Calendar: classes, assessment tasks, self/AI tasks.
// Weekly is the primary view; monthly and Kanban are switchable from the toolbar.
//
// Subjects and assessments come from the Canvas scraper's last run
// (`lib/scraper/calendar`). Replace with a Supabase query over
// `calendar_events` when the backend is ready.
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { loadCalendarData } from "@/lib/scraper/calendar";

export const metadata = { title: "Calendar · Canoka" };

// Read the scraper's output on every request, so a new scrape shows up on reload.
export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const { events, courses } = await loadCalendarData();

  return (
    <main>
      <CalendarWorkspace events={events} courses={courses} />
    </main>
  );
}
