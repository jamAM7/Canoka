import path from "node:path";
import { readEnvFile, writeEnvFile } from "@/lib/env-file";

// The Anthropic API key, kept in llm/.env beside the Python scripts in llm/
// that read it too. Server-only: the key never goes to the browser.

const ENV_FILE = path.join(process.cwd(), "llm", ".env");
const KEY = /^sk-ant-[\w-]{20,300}$/;

/** The key to call Claude with: the environment's if set, as the SDK would, else llm/.env's. */
export function anthropicKey(): string | null {
  return process.env.ANTHROPIC_API_KEY || readEnvFile(ENV_FILE).ANTHROPIC_API_KEY || null;
}

/** Saves { apiKey } from the Settings page. Throws a message to show. */
export function saveAnthropicKey(input: unknown): void {
  const apiKey = (input as { apiKey?: unknown } | null)?.apiKey;
  const key = typeof apiKey === "string" ? apiKey.trim() : "";
  if (!KEY.test(key)) throw new Error("That doesn't look like an Anthropic API key. They start with sk-ant-.");
  writeEnvFile(
    ENV_FILE,
    { ANTHROPIC_API_KEY: key },
    "Anthropic API key for Canoka's AI features and the scripts in llm/. Never commit this file.",
  );
}
