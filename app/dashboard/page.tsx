// Home dashboard — scoped to exactly what the README assigns it:
// notifications, "due this week", and quick links into notes.
import { MOCK_COURSES, MOCK_EVENTS } from "@/lib/calendar/mock-data";
import { Sidebar } from "@/components/shell/Sidebar";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export const metadata = { title: "Dashboard · Canoka" };

export default function DashboardPage() {
  return (
    <div className="app-shell">
      <Sidebar active="dashboard" />
      <main className="main">
        <DashboardContent events={MOCK_EVENTS} courses={MOCK_COURSES} />
      </main>
    </div>
  );
}
