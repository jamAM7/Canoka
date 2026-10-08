// Settings: appearance and accessibility, Canvas connection, calendar subscriptions, notification prefs.
// TODO: notification preferences.
import { Sidebar } from "@/components/shell/Sidebar";
import { AiSettings } from "@/components/settings/AiSettings";
import { AppearanceSettings } from "@/components/settings/AppearanceSettings";
import { ScraperSettings } from "@/components/settings/ScraperSettings";
import { TimetableSettings } from "@/components/settings/TimetableSettings";
import { anthropicKey } from "@/lib/ai/key";
import { timetableUrl } from "@/lib/data/timetable";
import { scrapeProgress, scraperSetup } from "@/lib/scraper/runner";
import { lastScrape } from "@/lib/scraper/subjects";

export const metadata = { title: "Settings · Canoka" };

// The scraper's setup, last scrape, any running scrape, the AI key and the timetable link are read on every request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return (
    <div className="app-shell">
      <Sidebar active="settings" />
      <main className="main">
        <div className="space-y-6 p-8 md:p-10">
          <header className="px-2 pt-2">
            <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">Settings</h1>
            <p className="mt-1 text-sm text-text-muted">Connect Canvas, your timetable and AI, pull your subjects in, and set how Canoka looks.</p>
          </header>

          <ScraperSettings setup={scraperSetup()} lastScrape={await lastScrape()} progress={scrapeProgress()} />
          <TimetableSettings subscribed={timetableUrl() !== null} />
          <AiSettings hasKey={anthropicKey() !== null} />
          <AppearanceSettings />
        </div>
      </main>
    </div>
  );
}
