// POST /api/canvas/sync  { courses?: string[] }
// Saves what the last Canvas scrape found to Supabase: each subject's course,
// the student's enrolment, its modules and weeks, and its assessments (see
// lib/data/subject-sync). It reads scraper/out/, not Canvas, so run the
// scraper first: Settings calls this when a scrape succeeds.
//
// `courses` lists subject codes or Canvas course ids; leave it out for every
// subject in the last scrape. Safe to repeat: everything is an upsert.
//
// -> 200 { synced: SyncedSubject[], errors: { subject: string, error: string }[] }
//    Subjects fail independently, so some can be in `synced` and others in `errors`.
//    404 { error } when there is nothing to sync, 500 { error, errors } when every subject failed.
//
// Runs Python on this machine and writes with the service role key, so
// lib/guard limits it to local development.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { currentUser } from "@/lib/data/user";
import { loadSubjectRows, syncSubject, type SyncedSubject } from "@/lib/data/subject-sync";
import { loadSubjects } from "@/lib/scraper/subjects";

export const dynamic = "force-dynamic";

const SUBJECT = /^[\w.-]{1,40}$/;

export async function POST(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  const body = (await request.json().catch(() => ({}))) as { courses?: unknown } | null;
  const asked = Array.isArray(body?.courses) ? body.courses : [];
  if (asked.length > 50 || !asked.every((c) => typeof c === "string" && SUBJECT.test(c))) {
    return NextResponse.json({ error: "List subjects by code or course ID, e.g. 41052 41201." }, { status: 400 });
  }
  const subjects: string[] = asked.length > 0 ? (asked as string[]) : (await loadSubjects()).map((s) => s.id);
  if (subjects.length === 0) {
    return NextResponse.json({ error: "No subjects in the last scrape. Run the Canvas scraper first." }, { status: 404 });
  }

  let userId: string;
  try {
    userId = (await currentUser()).id;
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 500 });
  }

  // One at a time: they share the database, and each is quick.
  const synced: SyncedSubject[] = [];
  const errors: { subject: string; error: string }[] = [];
  for (const subject of subjects) {
    try {
      synced.push(await syncSubject(userId, await loadSubjectRows(subject)));
    } catch (error) {
      errors.push({ subject, error: messageOf(error) });
    }
  }

  if (synced.length === 0) {
    return NextResponse.json({ error: errors[0].error, errors }, { status: 500 });
  }
  return NextResponse.json({ synced, errors });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
