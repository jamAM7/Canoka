// Settings: Canvas connection, calendar subscriptions, notification prefs.
// TODO: calendar subscriptions and notification preferences.
import { NavBar } from "@/components/shell/NavBar";
import { AiSettings } from "@/components/settings/AiSettings";
import { ScraperSettings } from "@/components/settings/ScraperSettings";
import { anthropicKey } from "@/lib/ai/key";
import { scrapeProgress, scraperSetup } from "@/lib/scraper/runner";
import { lastScrape } from "@/lib/scraper/subjects";

export const metadata = { title: "Settings · Canoka" };

// The scraper's setup, last scrape, any running scrape and the AI key are read on every request.
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  return (
    <div className="app-shell">
      <NavBar active="settings" />
      <main className="main">
        <div className="space-y-6 p-8 md:p-10">
          <header className="px-2 pt-2">
            <h1 className="text-3xl font-bold tracking-tight text-text md:text-4xl">Settings</h1>
            <p className="mt-1 text-sm text-text-muted">Connect Canvas and AI, and pull your subjects into Canoka.</p>
          </header>

          <ScraperSettings setup={scraperSetup()} lastScrape={await lastScrape()} progress={scrapeProgress()} />
          <AiSettings hasKey={anthropicKey() !== null} />
        </div>
      </main>
    </div>
  );
}
