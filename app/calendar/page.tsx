// Calendar: classes, assessment tasks, self/AI tasks.
// Weekly is the primary view; monthly and Kanban are switchable from the toolbar.
//
// Assessments and study tasks come from Supabase (lib/data/calendar) on every
// request. The student's edits stay in this browser for now (lib/calendar/storage).
// There's no timetable table yet, so no classes show.
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { currentUser } from "@/lib/data/user";
import { getCalendarEvents, getCourses } from "@/lib/data/calendar";

export const metadata = { title: "Calendar · Canoka" };

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  try {
    const user = await currentUser();
    const courses = await getCourses(user.id);
    const events = await getCalendarEvents(
      user.id,
      courses.map((c) => c.id),
      user.timezone,
    );
    return (
      <main>
        <CalendarWorkspace events={events} courses={courses} />
      </main>
    );
  } catch (error) {
    return (
      <main className="p-8 md:p-10">
        <p className="text-error">
          Couldn&apos;t load your calendar: {error instanceof Error ? error.message : String(error)}
        </p>
      </main>
    );
  }
}
