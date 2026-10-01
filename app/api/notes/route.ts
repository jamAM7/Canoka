// The student's notes, by subject then week. Reads and writes Supabase with the
// service role key, scoped to the current user (lib/data/notes).
//
//   GET  /api/notes
//     -> { subjects: NotesSubject[], notes: NoteDto[] }       (lib/notes/types)
//   POST /api/notes  { courseId, moduleId, title?, content? }
//     -> 201 { note: NoteDto }
//   PATCH/DELETE /api/notes/[id]: see that route.
//
// `moduleId` is required: every note belongs to a week (a subject's
// course_modules row, from `subjects[].weeks[].moduleId`). `content` is a
// TipTap document. Errors are { error: string } with 400 (bad body), 404
// (not the student's subject, week or note), 413 (note too long) or 500.
// lib/guard limits it to local development until there's sign-in.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { currentUser } from "@/lib/data/user";
import { createNote, getNotesOverview, parseNewNote } from "@/lib/data/notes";
import { failure, readJson } from "@/lib/data/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    const user = await currentUser();
    return NextResponse.json(await getNotesOverview(user.id));
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    const input = parseNewNote(await readJson(request));
    const user = await currentUser();
    return NextResponse.json({ note: await createNote(user.id, input) }, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}
