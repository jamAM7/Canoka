// Settings › Canvas access token: how to make the token the Canvas scraper
// signs in with, step by step, and where to paste it. Linked from the API
// token field in Settings › Canvas scraper.
import type { ReactNode } from "react";
import Link from "next/link";
import { Sidebar } from "@/components/shell/Sidebar";
import { ChevronIcon } from "@/components/shell/icons";
import { scraperSetup } from "@/lib/scraper/runner";

export const metadata = { title: "Canvas access token · Canoka" };

// The saved Canvas address is read on every request, for the link to its settings.
export const dynamic = "force-dynamic";

/** Where the link goes when no Canvas is saved yet. */
const DEFAULT_CANVAS = "https://canvas.uts.edu.au";

const CARD = "rounded-xl border border-border bg-surface p-5 shadow-sm";
const CARD_TITLE = "text-xl font-semibold text-text";
const LINK = "font-medium text-primary hover:underline";
/** A button or field name, as Canvas or Canoka shows it. */
const UI = "font-semibold text-text";
const CODE = "font-mono text-xs";
const PRIMARY_BUTTON =
  "inline-flex rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-primary-dark";

export default function CanvasTokenPage() {
  const setup = scraperSetup();
  const canvasSettings = canvasSettingsUrl(setup.canvasUrl);

  return (
    <div className="app-shell">
      <Sidebar active="settings" />
      <main className="main">
        <div className="max-w-reading space-y-6 p-8 md:p-10">
          <header className="px-2 pt-2">
            <Link
              href="/settings"
              className="inline-flex items-center gap-1 text-sm font-medium text-text-muted hover:text-text"
            >
              <ChevronIcon dir="left" />
              Settings
            </Link>
            <h1 className="mt-3 text-3xl font-bold tracking-tight text-text md:text-4xl">
              Get a Canvas access token
            </h1>
            <p className="mt-1 text-sm text-text-muted">
              The Canvas scraper signs in to Canvas with an access token that you make there. It takes a minute.
              {setup.token && " You already have one saved: saving a new one replaces it."}
            </p>
          </header>

          <section className={CARD}>
            <h2 className={CARD_TITLE}>Make a token</h2>
            <ol className="mt-5 space-y-6">
              <Step n={1} title="Open your Canvas settings">
                <p>
                  Sign in to Canvas, then choose <strong className={UI}>Account</strong> (your picture, at the top of
                  the menu on the left) › <strong className={UI}>Settings</strong>.
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <a href={canvasSettings.href} target="_blank" rel="noopener noreferrer" className={PRIMARY_BUTTON}>
                    Open Canvas settings
                  </a>
                  <span className="text-xs">Opens {canvasSettings.host} in a new tab.</span>
                </div>
              </Step>
              <Step n={2} title="Start a new token">
                <p>
                  Scroll down to <strong className={UI}>Approved Integrations</strong> and click{" "}
                  <strong className={UI}>+ New Access Token</strong>.
                </p>
              </Step>
              <Step n={3} title="Say what it's for">
                <p>
                  Type <strong className={UI}>Canoka</strong> as the <strong className={UI}>Purpose</strong>, so you
                  can tell it apart later. For <strong className={UI}>Expires</strong>, pick the last day of the
                  session, or leave it blank. Your university may limit how long a token lasts.
                </p>
              </Step>
              <Step n={4} title="Generate it, then copy it">
                <p>
                  Click <strong className={UI}>Generate Token</strong> and copy the{" "}
                  <strong className={UI}>Token</strong> straight away: a number, a <code className={CODE}>~</code>,
                  then a long run of letters and numbers. Canvas shows it only once, so if you close the window before
                  copying it, make another one.
                </p>
              </Step>
              <Step n={5} title="Paste it into Canoka">
                <p>
                  In{" "}
                  <Link href="/settings#canvas" className={LINK}>
                    Settings › Canvas scraper
                  </Link>
                  , enter your <strong className={UI}>Canvas URL</strong>: the address you sign in to, like{" "}
                  <code className={CODE}>https://canvas.uts.edu.au</code>. The address of any Canvas page works too, as
                  Canoka keeps only the start. Paste the token into <strong className={UI}>API token</strong> and click{" "}
                  <strong className={UI}>Save</strong>.
                </p>
                <p>
                  Then click <strong className={UI}>Run scrape</strong> to pull in your subjects.
                </p>
              </Step>
            </ol>
          </section>

          <section className={CARD}>
            <h2 className={CARD_TITLE}>Keep it safe</h2>
            <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-text-muted">
              <li>Anyone who has the token can use Canvas as you, so treat it like a password.</li>
              <li>
                Canoka keeps it only in <code className={CODE}>scraper/.env</code> on this computer. Git ignores that
                file, so it never ends up in a commit, and Settings never shows the token again.
              </li>
              <li>Everyone makes their own. Don&apos;t share yours or post it in a chat.</li>
              <li>
                If it gets out, delete it in Canvas under <strong className={UI}>Account</strong> ›{" "}
                <strong className={UI}>Settings</strong> › <strong className={UI}>Approved Integrations</strong>, with
                the bin next to Canoka. Then make a new one.
              </li>
            </ul>
          </section>

          <section className={CARD}>
            <h2 className={CARD_TITLE}>If something goes wrong</h2>
            <dl className="mt-3 space-y-4 text-sm">
              <Problem title="There's no New Access Token button">
                Your university has turned off tokens for students. Ask its IT service desk.
              </Problem>
              <Problem title="Settings says “That doesn't look like a Canvas access token.”">
                Copy the token again: all of it, and nothing else. If Canvas no longer shows it, make a new one.
              </Problem>
              <Problem title="Settings says “Paste the access token for this Canvas too.”">
                You changed the Canvas URL. A token only works on the Canvas that made it, so make one there.
              </Problem>
              <Problem title="The scrape stops at “Could not list courses” with a 401">
                Canvas turned the token down: it&apos;s wrong, expired, deleted, or from a different Canvas. Make a new
                one and save it.
              </Problem>
            </dl>
          </section>
        </div>
      </main>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white">
        {n}
      </span>
      <div className="min-w-0 flex-1 pt-0.5">
        <h3 className="text-base font-semibold text-text">{title}</h3>
        <div className="mt-1 space-y-3 text-sm text-text-muted">{children}</div>
      </div>
    </li>
  );
}

function Problem({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <dt className="font-medium text-text">{title}</dt>
      <dd className="mt-0.5 text-text-muted">{children}</dd>
    </div>
  );
}

/** Canvas's own settings page, where tokens are made: on the saved Canvas, else the default. Only ever https. */
function canvasSettingsUrl(canvasUrl: string | null): URL {
  try {
    // CANVAS_BASE_URL from the environment arrives unchecked, unlike an address saved from Settings.
    const url = new URL("/profile/settings", canvasUrl ?? DEFAULT_CANVAS);
    if (url.protocol === "https:") return url;
  } catch {
    // Not an address: use the default.
  }
  return new URL("/profile/settings", DEFAULT_CANVAS);
}
