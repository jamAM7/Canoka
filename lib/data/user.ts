import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, supabaseAdmin } from "@/lib/supabase/server";
import type { UserRow } from "@/lib/supabase/types";
import { dbError } from "./db-error";
import { NotesError } from "./notes";

// The signed-in student: the public.users row for the Supabase Auth account
// whose session cookie came with the request (sign-in is /sign-up, and
// middleware.ts keeps the app's pages behind it). An account's row is made the
// first time it signs in, so each person starts with their own subjects, notes
// and Canvas connection. Everything downstream takes public.users.id.

export interface CurrentUser {
  /** public.users.id: what notes, enrolments and plans reference. */
  id: string;
  /** The Supabase Auth account's id: what per-account tables like calendar_state and profiles key on. */
  authUserId: string;
  email: string;
  fullName: string | null;
  timezone: string;
}

type UserFields = Pick<UserRow, "id" | "email" | "full_name" | "timezone">;
const COLUMNS = "id, email, full_name, timezone";

/** Once per request, however many server components ask. Throws a 401 NotesError when signed out. */
export const currentUser = cache(async (): Promise<CurrentUser> => {
  const { data } = await createClient().auth.getUser();
  if (!data.user) throw new NotesError("Sign in first.", 401);
  const row = (await userFor(data.user.id)) ?? (await addUser(data.user));
  return { id: row.id, authUserId: data.user.id, email: row.email, fullName: row.full_name, timezone: row.timezone };
});

async function userFor(authUserId: string): Promise<UserFields | null> {
  const { data, error } = await supabaseAdmin()
    .from("users")
    .select(COLUMNS)
    .eq("auth_user_id", authUserId)
    .overrideTypes<UserFields[], { merge: false }>();
  if (error) throw dbError("Couldn't load your account", error);
  return data[0] ?? null;
}

/**
 * The account's first request: its own row, empty. An upsert, so two first
 * requests at once make one row (a unique index on auth_user_id), and it
 * returns the row. Looking it up again instead would get userFor's first,
 * empty answer back: in a page render Next memoizes identical GET requests.
 */
async function addUser(account: User): Promise<UserFields> {
  const fullName = typeof account.user_metadata?.full_name === "string" ? account.user_metadata.full_name.trim() : "";
  const { data, error } = await supabaseAdmin()
    .from("users")
    .upsert(
      { auth_user_id: account.id, email: account.email ?? `${account.id}@accounts.canoka`, full_name: fullName || null },
      { onConflict: "auth_user_id" },
    )
    .select(COLUMNS)
    .overrideTypes<UserFields[], { merge: false }>();
  if (error) throw dbError("Couldn't set up your account", error);
  if (!data[0]) throw new Error("Couldn't set up your account: Supabase didn't return its row.");
  return data[0];
}
