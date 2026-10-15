// Settings: appearance and accessibility, Canvas connection, calendar subscriptions, study hours, notification prefs.
// TODO: notification preferences.
import { NavBar } from "@/components/shell/NavBar";
import { AiSettings } from "@/components/settings/AiSettings";
import { AccountSettings } from "@/components/settings/AccountSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { CanvasSettings } from "@/components/settings/CanvasSettings";
import { ScraperSettings } from "@/components/settings/ScraperSettings";
import { StudyHoursSettings } from "@/components/settings/StudyHoursSettings";
import { TimetableSettings } from "@/components/settings/TimetableSettings";
import { anthropicKey } from "@/lib/ai/key";
import { canvasConnection, type CanvasConnection } from "@/lib/data/canvas-connection";
import { studyHours, type StudyHours } from "@/lib/data/study-preferences";
import { timetableUrl } from "@/lib/data/timetable";
import { currentUser } from "@/lib/data/user";
import { scrapeProgress, scraperSetup } from "@/lib/scraper/runner";
import { lastScrape } from "@/lib/scraper/subjects";

export const metadata = { title: "Settings · Canoka" };

// The Canvas connection, the timetable link, study hours, the AI key and, locally, the scraper's state are read on every request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // The local scraper runs Python, which the hosted site doesn't have.
  const local = process.env.NODE_ENV !== "production";

  let connection: CanvasConnection | null = null;
  let subscribed = false;
  let hours: StudyHours | null = null;
  let email: string | null = null;
  let problem: string | null = null;
  try {
    const user = await currentUser();
    email = user.email;
    [connection, subscribed, hours] = await Promise.all([
      canvasConnection(user.id),
      timetableUrl(user.id).then((url) => url !== null),
      // Its section says when they couldn't be loaded, so that isn't a Canvas problem.
      studyHours(user.id).catch(() => null),
    ]);
  } catch (error) {
    problem = error instanceof Error ? error.message : String(error);
  }

  return (
    <div className="app-shell">
      <NavBar active="settings" />
      <main className="main">
        <div className="space-y-6 p-8 md:p-10">
          <header className="px-2 pt-2">
            <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">Settings</h1>
            <p className="mt-1 text-sm text-text-muted">Connect Canvas, your timetable and AI, pull your subjects in, and set how Canoka looks.</p>
          </header>

          <CanvasSettings connection={connection} problem={problem} />
          {local && (
            <ScraperSettings setup={scraperSetup(connection)} lastScrape={await lastScrape()} progress={scrapeProgress()} />
          )}
          <TimetableSettings subscribed={subscribed} />
          <StudyHoursSettings hours={hours} />
          <AiSettings hasKey={anthropicKey() !== null} hosted={!local} />
          <AccountSettings email={email} />
          <AppearanceSettings />
        </div>
      </main>
    </div>
  );
}
