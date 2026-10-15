// Settings: appearance and accessibility, Canvas connection, calendar subscriptions, notification prefs.
// TODO: notification preferences.
import { NavBar } from "@/components/shell/NavBar";
import { AiSettings } from "@/components/settings/AiSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { CanvasSettings } from "@/components/settings/CanvasSettings";
import { ScraperSettings } from "@/components/settings/ScraperSettings";
import { TimetableSettings } from "@/components/settings/TimetableSettings";
import { anthropicKey } from "@/lib/ai/key";
import { canvasConnection, type CanvasConnection } from "@/lib/data/canvas-connection";
import { timetableUrl } from "@/lib/data/timetable";
import { currentUser } from "@/lib/data/user";
import { scrapeProgress, scraperSetup } from "@/lib/scraper/runner";
import { lastScrape } from "@/lib/scraper/subjects";

export const metadata = { title: "Settings · Canoka" };

// The Canvas connection, the timetable link, the AI key and, locally, the scraper's state are read on every request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  // The local scraper runs Python, which the hosted site doesn't have.
  const local = process.env.NODE_ENV !== "production";

  let connection: CanvasConnection | null = null;
  let subscribed = false;
  let problem: string | null = null;
  try {
    const user = await currentUser();
    [connection, subscribed] = await Promise.all([
      canvasConnection(user.id),
      timetableUrl(user.id).then((url) => url !== null),
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
          <AiSettings hasKey={anthropicKey() !== null} hosted={!local} />
          <AppearanceSettings />
        </div>
      </main>
    </div>
  );
}
