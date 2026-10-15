// Checks the settings Canoka needs before it starts or builds, so a missing or
// mixed-up key stops the command with a message saying which one and where to
// get it, instead of a site that loads and then can't sign anyone in.
//
// Runs on its own before `npm run dev` and `npm run build`: on every machine,
// in CI, and on Netlify for deploy previews and the live site alike. It reads
// .env.local and the other .env files the way Next does, then the environment.
// It prints names, never values. Errors stop the command; warnings don't.
//
//   npm run check:env   the same check, by hand

import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");

// `next dev` also reads .env.development*, a build .env.production*: check what the command will use.
loadEnvConfig(ROOT, process.env.npm_lifecycle_event === "predev", { info: () => {}, error: console.error });

const KEYS = "Supabase → Project Settings → API Keys";
const env = (name) => (process.env[name] ?? "").trim();
const errors = [];
const warnings = [];

const url = env("NEXT_PUBLIC_SUPABASE_URL");
if (!url) {
  errors.push("NEXT_PUBLIC_SUPABASE_URL is missing: the project's URL, from Supabase → Project Settings → Data API.");
} else if (!/^https:\/\/[^/\s]+\/?$/.test(url)) {
  errors.push("NEXT_PUBLIC_SUPABASE_URL should look like https://abcd1234.supabase.co.");
}

const browserName = env("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
  ? "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
  : "NEXT_PUBLIC_SUPABASE_ANON_KEY";
const browserKey = env(browserName);
const serverKey = env("SUPABASE_SERVICE_ROLE_KEY");

if (!browserKey) {
  errors.push(`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY is missing: sign-in needs it. It's the publishable key, from ${KEYS}.`);
} else if (role(browserKey) === "secret" || browserKey === serverKey) {
  // Everything NEXT_PUBLIC_ is built into the pages, so this would hand the database to anyone.
  errors.push(`${browserName} holds a secret key, and NEXT_PUBLIC_ settings go to every browser. Use the publishable key, from ${KEYS}.`);
}

if (!serverKey) {
  errors.push(`SUPABASE_SERVICE_ROLE_KEY is missing: the server reads and writes the database with it. It's the secret key, from ${KEYS}.`);
} else if (role(serverKey) === "public") {
  errors.push(`SUPABASE_SERVICE_ROLE_KEY holds the publishable key. Use the secret key, from ${KEYS}.`);
}

// Settings → AI can also save the key to llm/.env when running locally.
const llmEnv = path.join(ROOT, "llm", ".env");
const aiKey = env("ANTHROPIC_API_KEY") || (existsSync(llmEnv) && /^ANTHROPIC_API_KEY=\s*\S/m.test(readFileSync(llmEnv, "utf8")));
if (!aiKey) {
  warnings.push("ANTHROPIC_API_KEY isn't set, so AI review of notes and AI subtasks are off. Make one at console.anthropic.com.");
}

const where = process.env.NETLIFY ? `Netlify (${process.env.CONTEXT || "build"})` : process.env.CI ? "CI" : "this machine";
for (const warning of warnings) console.warn(`⚠ ${warning}`);
if (errors.length > 0) {
  console.error(
    [
      "",
      `Canoka isn't set up on ${where}:`,
      ...errors.map((error) => `  ✗ ${error}`),
      "",
      "Locally, put them in .env.local (start from .env.example).",
      "On Netlify: Site configuration → Environment variables, for all deploy contexts, then redeploy.",
      "",
    ].join("\n"),
  );
  process.exit(1);
}

/** "secret", "public", or null when the key's kind can't be told from it. */
function role(key) {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "public";
  // A legacy key is a JWT naming its role.
  try {
    const claims = JSON.parse(Buffer.from(key.split(".")[1] ?? "", "base64url").toString("utf8"));
    if (claims.role === "service_role") return "secret";
    if (claims.role === "anon") return "public";
  } catch {
    // Not a JWT.
  }
  return null;
}
