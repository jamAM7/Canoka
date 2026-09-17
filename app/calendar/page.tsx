// Calendar: classes, assessment tasks, self/AI tasks.
// Weekly is the primary view; monthly and Kanban are switchable from the toolbar.
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { getCoursesForUser, getCalendarEventsForUser } from "@/lib/calendar/supabase-events";

export const metadata = { title: "Calendar · Canoka" };

// TEMPORARY: no auth yet, so this is hardcoded to the dev-test user row.
// Replace with the real logged-in user's id once sign-up/auth exists.
const DEV_USER_ID = "77d1a476-bd08-48c1-96ff-c54e601fd2f2";

export default async function CalendarPage() {
  const [courses, events] = await Promise.all([
    getCoursesForUser(DEV_USER_ID),
    getCalendarEventsForUser(DEV_USER_ID),
  ]);

  return (
    <main>
      <CalendarWorkspace events={events} courses={courses} />
    </main>
  );
}














// // Calendar: classes, assessment tasks, self/AI tasks.
// // Weekly is the primary view; monthly and Kanban are switchable from the toolbar.
// //
// // Data is mocked in `lib/calendar/mock-data` for this frontend pass. Replace
// // with a Supabase query over `calendar_events` when the backend is ready.
// import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
// import { MOCK_COURSES, MOCK_EVENTS } from "@/lib/calendar/mock-data";

// export const metadata = { title: "Calendar · Canoka" };

// export default function CalendarPage() {
//   return (
//     <main>
//       <CalendarWorkspace events={MOCK_EVENTS} courses={MOCK_COURSES} />
//     </main>
//   );
// }
