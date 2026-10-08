// Home dashboard — scoped to exactly what the README assigns it:
// notifications, "due this week", and quick links into notes.
import { loadCalendarData } from "@/lib/scraper/calendar";
import { Sidebar } from "@/components/shell/Sidebar";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export const metadata = { title: "Dashboard · Canoka" };

// Read the scraper's output on every request, so a new scrape shows up on reload.
export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const { events, courses } = await loadCalendarData();

  return (
    <div className="app-shell">
      <Sidebar active="dashboard" />
      <main className="main">
        <DashboardContent events={events} courses={courses} />
      </main>
    </div>
  );
}
