import "server-only";
import { cache } from "react";
import { SupabaseConfigError, supabaseAdmin } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";

// The signed-in student. There's no sign-in yet, so it's the shared dev user
// whose public.users.id is SUPABASE_USER_ID. Once Supabase Auth exists, look
// the row up by users.auth_user_id instead; everything downstream already
// takes public.users.id.

export interface CurrentUser {
  /** public.users.id: what notes, enrolments and plans reference. */
  id: string;
  email: string;
  fullName: string | null;
  timezone: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Once per request, however many server components ask. */
export const currentUser = cache(async (): Promise<CurrentUser> => {
  const id = process.env.SUPABASE_USER_ID?.trim();
  if (!id || !UUID.test(id)) {
    throw new SupabaseConfigError(
      "Set SUPABASE_USER_ID in .env.local to the dev user's public.users.id (ask the team for the shared one).",
    );
  }

  const { data, error } = await supabaseAdmin()
    .from("users")
    .select("id, email, full_name, timezone")
    .eq("id", id)
    .overrideTypes<Pick<UserRow, "id" | "email" | "full_name" | "timezone">[], { merge: false }>();
  if (error) throw new Error(`Couldn't load the current user: ${error.message}`);
  const row = data[0];
  if (!row) throw new SupabaseConfigError(`No public.users row has id ${id}. Check SUPABASE_USER_ID.`);

  return { id: row.id, email: row.email, fullName: row.full_name, timezone: row.timezone };
});
