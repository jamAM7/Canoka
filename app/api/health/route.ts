// GET /api/health
// Whether this copy of Canoka is set up: its settings, the database, sign-in,
// AI, and the migrations in supabase/migrations/. Open it wherever the app runs
// (localhost, a deploy preview, the live site) to check that environment. It
// never shows a key, and reads no student's data: each migration is checked by
// asking for zero rows of something it made.
//
// -> 200 { ok: true, checks } when everything required passes, else 503 { ok: false, checks }
//    checks: { name, ok, required, detail }[]
import { NextResponse } from "next/server";
import { anthropicKey } from "@/lib/ai/key";
import { supabaseConfig } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Check {
  name: string;
  ok: boolean;
  /** An optional one (AI) can fail without the app being broken. */
  required: boolean;
  detail: string;
}

// What each migration made, as [table, column]. Migrations that only change policies or existing rows can't be checked this way.
const MIGRATIONS: { file: string; made: [string, string][] }[] = [
  { file: "20261001120000_course_modules_week_number.sql", made: [["course_modules", "week_number"]] },
  { file: "20261001120100_week_reviews.sql", made: [["week_reviews", "id"]] },
  { file: "20261008020000_auth_and_student_data.sql", made: [["profiles", "user_id"]] },
  {
    file: "20261016120000_canvas_connections.sql",
    made: [
      ["canvas_connections", "user_id"],
      ["users", "timetable_ical_url"],
    ],
  },
  { file: "20261016130000_accounts_and_canvas_files.sql", made: [["canvas_files", "course_id"]] },
];
/** Postgres and PostgREST codes for a table or column that isn't there. */
const MISSING = new Set(["42P01", "42703", "PGRST204", "PGRST205"]);

export async function GET() {
  const checks: Check[] = [];
  const add = (name: string, ok: boolean, detail: string, required = true) => checks.push({ name, ok, required, detail });

  const signIn = supabaseConfig() !== null;
  add(
    "Sign-in",
    signIn,
    signIn
      ? "The Supabase URL and publishable key are built in."
      : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, then build again.",
  );

  try {
    const db = supabaseAdmin();
    const { error } = await db.from("users").select("id").limit(0);
    add("Database", !error, error ? `Couldn't read it with the server key: ${error.message}` : "Reachable with the server key.");
    if (!error) {
      for (const m of MIGRATIONS) {
        let detail = "Applied.";
        for (const [table, column] of m.made) {
          const { error: probe } = await db.from(table).select(column).limit(0);
          if (!probe) continue;
          detail = MISSING.has(probe.code ?? "")
            ? `Not applied (${table}.${column} is missing): run it in the Supabase SQL editor.`
            : `Couldn't check: ${probe.message}`;
          break;
        }
        add(`Migration ${m.file}`, detail === "Applied.", detail);
      }
    }
  } catch (error) {
    add("Database", false, error instanceof Error ? error.message : String(error));
  }

  const ai = anthropicKey() !== null;
  add("AI", ai, ai ? "An Anthropic API key is set." : "No ANTHROPIC_API_KEY, so AI review and AI subtasks are off.", false);

  const ok = checks.every((c) => c.ok || !c.required);
  return NextResponse.json({ ok, checks }, { status: ok ? 200 : 503 });
}
