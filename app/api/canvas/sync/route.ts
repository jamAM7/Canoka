// POST /api/canvas/sync  { courses?: string[] }
// Pulls the student's subjects from Canvas into Supabase: each subject's course,
// the student's enrolment, its modules and weeks, and its assessments (see
// lib/canvas/subject and lib/data/subject-sync). It signs in with the Canvas
// connection saved from Settings (lib/data/canvas-connection), so it works on
// the hosted site as well as locally.
//
// `courses` lists subject codes or Canvas course ids, from any session; leave
// it out for every subject in the current session. Safe to repeat: everything
// is an upsert.
//
// -> 200 { synced: SyncedSubject[], errors: { subject: string, error: string }[],
//          session: string | null, warnings: string[] }
//    Subjects fail independently, so some can be in `synced` and others in `errors`.
//    400 { error } when Canvas isn't connected or turns the token down,
//    404 { error } when Canvas lists no subjects, 502 { error } when Canvas can't be read,
//    500 { error, errors } when every subject failed.
//
// lib/guard only checks the request came from this app.
import { NextResponse } from "next/server";
import { CanvasError, mapLimit } from "@/lib/canvas/client";
import { currentSubjects, fetchSubject, findSubjects, subjectCode, subjectRows, type SubjectList } from "@/lib/canvas/subject";
import { requireSameOrigin } from "@/lib/guard";
import { canvasClientFor, markCanvasSynced, signInProblem } from "@/lib/data/canvas-connection";
import { syncSubject, type SyncedSubject } from "@/lib/data/subject-sync";
import { currentUser } from "@/lib/data/user";

export const dynamic = "force-dynamic";

const SUBJECT = /^[\w.-]{1,40}$/;
/** Subjects synced at once: each is a few requests to Canvas and a few to the database. */
const AT_ONCE = 2;

export async function POST(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  const body = (await request.json().catch(() => ({}))) as { courses?: unknown } | null;
  const asked = Array.isArray(body?.courses) ? body.courses : [];
  if (asked.length > 50 || !asked.every((c) => typeof c === "string" && SUBJECT.test(c))) {
    return NextResponse.json({ error: "List subjects by code or course ID, e.g. 41052 41201." }, { status: 400 });
  }

  let userId: string;
  let client: Awaited<ReturnType<typeof canvasClientFor>>;
  try {
    userId = (await currentUser()).id;
    client = await canvasClientFor(userId);
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 500 });
  }
  if (!client) {
    return NextResponse.json({ error: "Connect Canvas first: save your Canvas URL and access token." }, { status: 400 });
  }
  const canvas = client;

  let list: SubjectList;
  try {
    list = asked.length > 0 ? await findSubjects(canvas, asked as string[]) : await currentSubjects(canvas);
  } catch (error) {
    if (error instanceof CanvasError && error.status === 401) {
      return NextResponse.json({ error: signInProblem(error, canvas.baseUrl) }, { status: 400 });
    }
    return NextResponse.json({ error: `Couldn't list your subjects in Canvas: ${messageOf(error)}` }, { status: 502 });
  }
  if (list.courses.length === 0) {
    return NextResponse.json({ error: "Canvas lists no subjects for you.", warnings: list.warnings }, { status: 404 });
  }

  const synced: SyncedSubject[] = [];
  const errors: { subject: string; error: string }[] = [];
  await mapLimit(list.courses, AT_ONCE, async (course) => {
    try {
      const document = await fetchSubject(canvas, course);
      const subject = await syncSubject(userId, subjectRows(document, canvas.baseUrl));
      // A hidden tab isn't a failure, but the subject is missing whatever it held.
      for (const [endpoint, outcome] of Object.entries(document.coverage)) {
        if (outcome.status !== "ok") subject.warnings.push(`Canvas didn't give its ${endpoint.replace("_", " ")} (${outcome.status}).`);
      }
      synced.push(subject);
    } catch (error) {
      errors.push({ subject: subjectCode(course) ?? String(course.id), error: messageOf(error) });
    }
  });
  synced.sort((a, b) => (a.code ?? a.name).localeCompare(b.code ?? b.name));

  if (synced.length === 0) {
    return NextResponse.json({ error: errors[0].error, errors }, { status: 500 });
  }
  try {
    await markCanvasSynced(userId);
  } catch (error) {
    console.error(error);
  }
  return NextResponse.json({ synced, errors, session: list.session, warnings: list.warnings });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
