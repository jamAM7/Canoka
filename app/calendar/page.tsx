<<<<<<< HEAD
import StudyFlowApp from "../../components/studyflow-app";

export default function CalendarPage() {
  return <StudyFlowApp initialView="calendar" />;
}
=======
// Calendar: classes, assessment tasks, self/AI tasks.
// Weekly is the primary view; monthly and Kanban are switchable from the toolbar.
//
// Data is mocked in `lib/calendar/mock-data` for this frontend pass. Replace
// with a Supabase query over `calendar_events` when the backend is ready.
import { CalendarWorkspace } from "@/components/calendar/CalendarWorkspace";
import { MOCK_COURSES, MOCK_EVENTS } from "@/lib/calendar/mock-data";

export const metadata = { title: "Calendar · Canoka" };

export default function CalendarPage() {
  return (
    <main>
      <CalendarWorkspace events={MOCK_EVENTS} courses={MOCK_COURSES} />
    </main>
  );
}
>>>>>>> origin/Mind
