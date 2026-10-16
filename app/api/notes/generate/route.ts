// Generates one editable study note from a subject week's stored Canvas content.
// POST /api/notes/generate  { courseId, week, learningProfile? }
//   -> 201 { note: NoteDto }
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/guard";
import { NoteGenerationError } from "@/lib/ai/generate-notes";
import { currentUser } from "@/lib/data/user";
import { failure, readJson } from "@/lib/data/http";
import { generateWeekNote, parseGenerateNoteInput } from "@/lib/data/note-generation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const input = parseGenerateNoteInput(await readJson(request));
    const user = await currentUser();
    return NextResponse.json({ note: await generateWeekNote(user, input) }, { status: 201 });
  } catch (error) {
    if (error instanceof NoteGenerationError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    return failure(error);
  }
}
