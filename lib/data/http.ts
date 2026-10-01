import "server-only";
import { NextResponse } from "next/server";
import { NotesError } from "./notes";

// Shared by the route handlers that read and write the student's data.

/** The request's JSON body, or a 400. */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new NotesError("Send the request as JSON.", 400);
  }
}

/** A JSON error response: the status a NotesError carries, else 500. */
export function failure(error: unknown): NextResponse {
  const status = error instanceof NotesError ? error.status : 500;
  if (status === 500) console.error(error);
  return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status });
}
