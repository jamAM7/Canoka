import path from "node:path";
import { readEnvFile, writeEnvFile } from "@/lib/env-file";

// scraper/.env holds the Canvas address and access token that scrape.py signs
// in with. It's gitignored, and only read and written here, on the server.

const ENV_FILE = path.join(process.cwd(), "scraper", ".env");
const TOKEN = /^[\w~.-]{8,512}$/;

/** What scrape.py will read from scraper/.env. */
export function readCanvasEnv(): Record<string, string> {
  return readEnvFile(ENV_FILE);
}

/**
 * Saves { baseUrl, token } from the Settings page. An empty token keeps the
 * saved one, but only for the same Canvas: a token works only where it was
 * issued, and this way the saved one can't be pointed at another server.
 * Returns the address as saved; throws a message to show.
 */
export function saveCanvasSettings(input: unknown): string {
  const raw = (input ?? {}) as Record<string, unknown>;
  const baseUrl = httpsOrigin(raw.baseUrl);
  if (!baseUrl) throw new Error("Enter your Canvas address, e.g. https://canvas.uts.edu.au.");
  const token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (token && !TOKEN.test(token)) throw new Error("That doesn't look like a Canvas access token.");

  if (!token) {
    const saved = readCanvasEnv();
    if (!saved.CANVAS_TOKEN) throw new Error("Paste your Canvas access token.");
    if (httpsOrigin(saved.CANVAS_BASE_URL) !== baseUrl) {
      throw new Error("Paste the access token for this Canvas too.");
    }
  }

  writeEnvFile(
    ENV_FILE,
    token ? { CANVAS_BASE_URL: baseUrl, CANVAS_TOKEN: token } : { CANVAS_BASE_URL: baseUrl },
    "Canvas sign-in for scrape.py, saved from Canoka's Settings page. Never commit this file.",
  );
  return baseUrl;
}

function httpsOrigin(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
