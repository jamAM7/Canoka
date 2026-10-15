import { createBrowserClient } from "@supabase/ssr";
import { supabaseConfig } from "./config";

export function createClient() {
  const config = supabaseConfig();
  if (!config) throw new Error("Supabase is not configured. Add the project URL and publishable key to .env.");
  return createBrowserClient(config.url, config.key);
}
