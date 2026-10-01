// Home dashboard — scoped to exactly what the README assigns it:
// notifications, "due this week", and quick links into notes.
// Reads the student's subjects and assessments from Supabase on every request.
import { Sidebar } from "@/components/shell/Sidebar";
import { DashboardContent } from "@/components/dashboard/DashboardContent";
import { currentUser } from "@/lib/data/user";
import { getCalendarEvents, getCourses } from "@/lib/data/calendar";

export const metadata = { title: "Dashboard · Canoka" };

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  return (
    <div className="app-shell">
      <Sidebar active="dashboard" />
      <main className="main">{await content()}</main>
    </div>
  );
}

async function content() {
  try {
    const user = await currentUser();
    const courses = await getCourses(user.id);
    const events = await getCalendarEvents(
      user.id,
      courses.map((c) => c.id),
      user.timezone,
    );
    const userName = user.fullName?.trim().split(/\s+/)[0] || user.email.split("@")[0];
    return <DashboardContent events={events} courses={courses} userName={userName} />;
  } catch (error) {
    return <LoadError error={error} />;
  }
}

function LoadError({ error }: { error: unknown }) {
  return (
    <div className="p-8 md:p-10">
      <p className="text-error">Couldn&apos;t load your dashboard: {error instanceof Error ? error.message : String(error)}</p>
    </div>
  );
}
