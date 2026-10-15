import "server-only";
import { CanvasError, canvasClient, type CanvasClient } from "@/lib/canvas/client";
import { supabaseAdmin } from "@/lib/supabase/server";
import { dbError } from "./db-error";
import { NotesError } from "./notes";

// The student's Canvas sign-in: the Canvas address and access token saved from
// Settings, one canvas_connections row per student (migration
// 20261016120000_canvas_connections). Everything that talks to Canvas signs in
// through here. The token is read only on the server and never goes back to
// the browser. It's stored as it is: see the migration for who can read it.

const TOKEN = /^[\w~.-]{8,512}$/;

/** What Settings shows of the connection. Never the token. */
export interface CanvasConnection {
  /** The Canvas site, e.g. https://canvas.uts.edu.au. */
  baseUrl: string;
  /** Who Canvas said the token belongs to when it was saved. */
  userName: string | null;
  lastSyncedAt: string | null;
}

interface ConnectionRow {
  base_url: string;
  token: string;
  canvas_user_name: string | null;
  last_synced_at: string | null;
}

export async function canvasConnection(userId: string): Promise<CanvasConnection | null> {
  const row = await loadRow(userId);
  return row && { baseUrl: row.base_url, userName: row.canvas_user_name, lastSyncedAt: row.last_synced_at };
}

/** The saved address and token, for code that signs in to Canvas itself (the local scraper). */
export async function canvasSignIn(userId: string): Promise<{ baseUrl: string; token: string } | null> {
  const row = await loadRow(userId);
  return row && { baseUrl: row.base_url, token: row.token };
}

/** A Canvas client signed in as the student, or null if they haven't connected Canvas. */
export async function canvasClientFor(userId: string): Promise<CanvasClient | null> {
  const signIn = await canvasSignIn(userId);
  return signIn && canvasClient(signIn.baseUrl, signIn.token);
}

/**
 * Saves { baseUrl, token } from Settings once Canvas accepts the token. An
 * empty token keeps the saved one, but only for the same Canvas: a token works
 * only where it was issued, and this way the saved one can't be pointed at
 * another server. Throws a NotesError to show.
 */
export async function saveCanvasConnection(userId: string, input: unknown): Promise<CanvasConnection> {
  const raw = (input ?? {}) as Record<string, unknown>;
  const baseUrl = httpsOrigin(raw.baseUrl);
  if (!baseUrl) throw new NotesError("Enter your Canvas address, e.g. https://canvas.uts.edu.au.", 400);
  let token = typeof raw.token === "string" ? raw.token.trim() : "";
  if (token && !TOKEN.test(token)) throw new NotesError("That doesn't look like a Canvas access token.", 400);

  const saved = await loadRow(userId);
  if (!token) {
    if (!saved) throw new NotesError("Paste your Canvas access token.", 400);
    if (saved.base_url !== baseUrl) throw new NotesError("Paste the access token for this Canvas too.", 400);
    token = saved.token;
  }

  let userName: string | null;
  try {
    const self = await canvasClient(baseUrl, token).get<{ name?: string; short_name?: string }>("/api/v1/users/self");
    userName = self.short_name || self.name || null;
  } catch (error) {
    throw new NotesError(signInProblem(error, baseUrl), 400);
  }

  const { error } = await supabaseAdmin()
    .from("canvas_connections")
    .upsert(
      { user_id: userId, base_url: baseUrl, token, canvas_user_name: userName, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw dbError("Couldn't save your Canvas connection", error);
  return { baseUrl, userName, lastSyncedAt: saved?.last_synced_at ?? null };
}

export async function deleteCanvasConnection(userId: string): Promise<void> {
  const { error } = await supabaseAdmin().from("canvas_connections").delete().eq("user_id", userId);
  if (error) throw dbError("Couldn't remove your Canvas connection", error);
}

export async function markCanvasSynced(userId: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .from("canvas_connections")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) throw dbError("Couldn't record the sync", error);
}

/** What to tell the student when Canvas didn't accept a request made with their token. */
export function signInProblem(error: unknown, baseUrl: string): string {
  if (!(error instanceof CanvasError)) return `Couldn't check the token with Canvas: ${String(error)}`;
  if (error.status === 401) {
    return "Canvas turned the token down: it's wrong, expired, deleted, or from a different Canvas. Make a new one and save it.";
  }
  if (error.status === 0) return `Couldn't reach ${baseUrl}. Check the address.`;
  if (error.status === 404) return `${baseUrl} doesn't look like a Canvas site. Check the address.`;
  // Not Canvas's own words: on a site that isn't Canvas they could be anything.
  return `Canvas answered with HTTP ${error.status}. Check the address and try again.`;
}

async function loadRow(userId: string): Promise<ConnectionRow | null> {
  const { data, error } = await supabaseAdmin()
    .from("canvas_connections")
    .select("base_url, token, canvas_user_name, last_synced_at")
    .eq("user_id", userId)
    .overrideTypes<ConnectionRow[], { merge: false }>();
  if (error) throw dbError("Couldn't load your Canvas connection", error);
  return data[0] ?? null;
}

function httpsOrigin(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? "").trim());
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}
