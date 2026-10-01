import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

// scraper/.env holds the Canvas address and access token that scrape.py signs
// in with. It's gitignored, and only read and written here, on the server.

const ENV_FILE = path.join(process.cwd(), "scraper", ".env");
const TOKEN = /^[\w~.-]{8,512}$/;

/** KEY=value lines, parsed like scrape.py's load_env. */
export function readEnvFile(): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(ENV_FILE)) return values;
  for (const line of readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    const eq = text.indexOf("=");
    if (!text || text.startsWith("#") || eq < 0) continue;
    values[text.slice(0, eq).trim()] = text.slice(eq + 1).trim().replace(/^["']+|["']+$/g, "");
  }
  return values;
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
    const saved = readEnvFile();
    if (!saved.CANVAS_TOKEN) throw new Error("Paste your Canvas access token.");
    if (httpsOrigin(saved.CANVAS_BASE_URL) !== baseUrl) {
      throw new Error("Paste the access token for this Canvas too.");
    }
  }

  writeEnvFile(token ? { CANVAS_BASE_URL: baseUrl, CANVAS_TOKEN: token } : { CANVAS_BASE_URL: baseUrl });
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

/** Replaces these keys' lines, or adds them, keeping the rest of the file as it was. */
function writeEnvFile(values: Record<string, string>) {
  const pending = new Map(Object.entries(values));
  const lines = existsSync(ENV_FILE)
    ? readFileSync(ENV_FILE, "utf8").split(/\r?\n/)
    : ["# Canvas sign-in for scrape.py, saved from Canoka's Settings page. Never commit this file."];

  const updated = lines.map((line) => {
    const key = line.trim().startsWith("#") ? "" : line.split("=")[0].trim();
    const value = pending.get(key);
    if (value === undefined) return line;
    pending.delete(key);
    return `${key}=${value}`;
  });
  while (updated.length > 0 && updated[updated.length - 1].trim() === "") updated.pop();
  pending.forEach((value, key) => updated.push(`${key}=${value}`));

  // Owner-only when created, as a file holding a token should be.
  writeFileSync(ENV_FILE, `${updated.join("\n")}\n`, { mode: 0o600 });
}
