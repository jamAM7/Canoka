import { existsSync, readFileSync, writeFileSync } from "node:fs";

// The gitignored KEY=value files that hold this machine's credentials:
// scraper/.env for Canvas, llm/.env for the Anthropic API. Server-only.

/** KEY=value lines, parsed like scraper/scrape.py's load_env. */
export function readEnvFile(file: string): Record<string, string> {
  const values: Record<string, string> = {};
  if (!existsSync(file)) return values;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const text = line.trim();
    const eq = text.indexOf("=");
    if (!text || text.startsWith("#") || eq < 0) continue;
    values[text.slice(0, eq).trim()] = text.slice(eq + 1).trim().replace(/^["']+|["']+$/g, "");
  }
  return values;
}

/**
 * Replaces these keys' lines, or adds them, keeping the rest of the file as it
 * was. A new file starts with `header` as its comment.
 */
export function writeEnvFile(file: string, values: Record<string, string>, header: string) {
  const pending = new Map(Object.entries(values));
  const lines = existsSync(file) ? readFileSync(file, "utf8").split(/\r?\n/) : [`# ${header}`];

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
  writeFileSync(file, `${updated.join("\n")}\n`, { mode: 0o600 });
}
