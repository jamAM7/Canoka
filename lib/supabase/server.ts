import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseConfig } from "./config";

import "server-only";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";

export function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured.");
  const cookieStore = cookies();

  return createServerClient(config.url, config.key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Components cannot write cookies; middleware refreshes them.
        }
      },
    },
  });
}

// The Supabase client for server code: route handlers and server components.
// It uses the service role key, which bypasses row level security, so it must
// never reach the browser. `server-only` makes any client import a build error.
// Every query through it must scope rows to the current user itself (see
// lib/data/user.ts), since RLS won't.

/** A required setting is missing. The message names it and where to get it. */
export class SupabaseConfigError extends Error {}

let client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (client) return client;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) {
    throw new SupabaseConfigError(
      "Set NEXT_PUBLIC_SUPABASE_URL in .env.local (Supabase project → Settings → API).",
    );
  }
  if (!key) {
    throw new SupabaseConfigError(
      "Set SUPABASE_SERVICE_ROLE_KEY in .env.local (Supabase project → Settings → API, the service_role key).",
    );
  }
  client = createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    // Next caches server-side fetches by default; database reads must always be fresh.
    global: { fetch: (input, init) => fetch(input, { ...init, cache: "no-store" }) },
  });
  return client;
}
