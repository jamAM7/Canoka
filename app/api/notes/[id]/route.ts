// One of the student's notes.
//
//   PATCH  /api/notes/[id]  { title?, content?, moduleId? }
//     -> { note: NoteDto }. Send only what changed. `content` is a TipTap
//        document, and `moduleId` moves the note to another of its subject's weeks.
//        Each change to `content` adds a row to the note's history (a database
//        trigger), so send it when the student pauses, not on every keystroke.
//   DELETE /api/notes/[id]
//     -> { id, archived: true }. The note is archived, not deleted: GET /api/notes
//        no longer lists it.
//
// Errors are { error: string }: 400 bad body, 404 not the student's note, 500.
// lib/guard limits it to local development until there's sign-in.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { currentUser } from "@/lib/data/user";
import { NotesError, archiveNote, isUuid, parseNotePatch, updateNote } from "@/lib/data/notes";
import { failure, readJson } from "@/lib/data/http";

export const dynamic = "force-dynamic";

interface Context {
  params: { id: string };
}

export async function PATCH(request: Request, { params }: Context) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    if (!isUuid(params.id)) throw new NotesError("That note no longer exists.", 404);
    const patch = parseNotePatch(await readJson(request));
    const user = await currentUser();
    return NextResponse.json({ note: await updateNote(user.id, params.id, patch) });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    if (!isUuid(params.id)) throw new NotesError("That note no longer exists.", 404);
    const user = await currentUser();
    await archiveNote(user.id, params.id);
    return NextResponse.json({ id: params.id, archived: true });
  } catch (error) {
    return failure(error);
  }
}
