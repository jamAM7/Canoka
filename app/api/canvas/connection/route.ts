// The student's Canvas connection, from Settings › Canvas.
//   GET    /api/canvas/connection                    -> { connection: CanvasConnection | null }
//   PUT    /api/canvas/connection  { baseUrl, token? }  checks the token with Canvas, then saves it
//                                                    -> { connection }
//          An empty token keeps the saved one, but only for the same Canvas.
//   DELETE /api/canvas/connection                    forgets the address and token -> { connection: null }
// The token is saved in Supabase (lib/data/canvas-connection) and never sent
// back. Errors are { error: string }: 400 to show, 500 anything else.
// lib/guard only checks the request came from this app.
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/guard";
import { canvasConnection, deleteCanvasConnection, saveCanvasConnection } from "@/lib/data/canvas-connection";
import { failure, readJson } from "@/lib/data/http";
import { currentUser } from "@/lib/data/user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const user = await currentUser();
    return NextResponse.json({ connection: await canvasConnection(user.id) });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const input = await readJson(request);
    const user = await currentUser();
    return NextResponse.json({ connection: await saveCanvasConnection(user.id, input) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const user = await currentUser();
    await deleteCanvasConnection(user.id);
    return NextResponse.json({ connection: null });
  } catch (error) {
    return failure(error);
  }
}
