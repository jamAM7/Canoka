// POST /api/canvas/files
// Reads the next Canvas files waiting in the student's subjects (PDFs, Word
// and PowerPoint files the last sync found) and keeps their text, so the AI
// review can check notes against them (lib/data/canvas-files). Each file is
// read once. A call stops starting new files after about 40 seconds, inside
// the hosted site's 60-second limit, so Settings calls it until `remaining`
// is 0. Safe to call any time: with nothing waiting it returns at once.
//
// -> 200 { read, skipped, failed, remaining }
//    400 { error } when Canvas isn't connected or turns the token down,
//    401 { error } when signed out.
//
// lib/guard only checks the request came from this app.
import { NextResponse } from "next/server";
import { CanvasError } from "@/lib/canvas/client";
import { requireSameOrigin } from "@/lib/guard";
import { canvasClientFor, signInProblem } from "@/lib/data/canvas-connection";
import { readWaitingFiles } from "@/lib/data/canvas-files";
import { failure } from "@/lib/data/http";
import { currentUser } from "@/lib/data/user";

export const dynamic = "force-dynamic";

const BUDGET_MS = 40_000;

export async function POST(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const user = await currentUser();
    const client = await canvasClientFor(user.id);
    if (!client) {
      return NextResponse.json({ error: "Connect Canvas first: save your Canvas URL and access token." }, { status: 400 });
    }
    try {
      return NextResponse.json(await readWaitingFiles(user.id, client, BUDGET_MS));
    } catch (error) {
      if (error instanceof CanvasError && error.badToken) {
        return NextResponse.json({ error: signInProblem(error, client.baseUrl) }, { status: 400 });
      }
      throw error;
    }
  } catch (error) {
    return failure(error);
  }
}
