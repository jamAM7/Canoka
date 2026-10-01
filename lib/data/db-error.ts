import "server-only";

// Turns a Supabase error into one with a message fit to show. A missing column
// or table almost always means a migration in supabase/migrations/ hasn't been
// applied to the database yet, so say that.

const MISSING = new Set(["42703", "42P01", "PGRST204", "PGRST205"]);

export function dbError(what: string, error: { message: string; code?: string }): Error {
  const hint = MISSING.has(error.code ?? "")
    ? " The database may be missing a migration: apply the files in supabase/migrations/."
    : "";
  return new Error(`${what}: ${error.message}.${hint}`);
}
