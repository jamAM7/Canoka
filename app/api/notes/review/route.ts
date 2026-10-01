// POST /api/notes/review  { subjectId, week, notes: [{ title, content }] }
// Reviews the student's notes for one week of a subject with Claude, against
// that week's Canvas content from the last scrape. Runs scraper/week.py and
// uses the API key on this machine, so lib/guard limits who can call it.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { ReviewError, reviewNotes } from "@/lib/ai/review";
import { noteText } from "@/lib/notes/storage";
import { loadSubjects } from "@/lib/scraper/subjects";
import { loadWeekContent } from "@/lib/scraper/week";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  let input: ReturnType<typeof parseInput>;
  try {
    input = parseInput(await request.json());
  } catch (error) {
    return NextResponse.json({ error: messageOf(error) }, { status: 400 });
  }

  const subject = (await loadSubjects()).find((s) => s.id === input.subjectId);
  if (!subject) {
    return NextResponse.json({ error: "That subject isn't in the last scrape." }, { status: 404 });
  }

  let weekContent: string | null;
  try {
    weekContent = await loadWeekContent(subject.id, input.week);
  } catch (error) {
    return NextResponse.json({ error: `Couldn't load the week's content: ${messageOf(error)}` }, { status: 500 });
  }

  try {
    const review = await reviewNotes({
      subject: [subject.code, subject.name].filter(Boolean).join(" "),
      week: input.week,
      weekTitle: subject.weeks.find((w) => w.number === input.week)?.title ?? null,
      weekContent,
      notes: input.notes,
    });
    return NextResponse.json({ review, hadCourseContent: weekContent !== null });
  } catch (error) {
    const status = error instanceof ReviewError ? 502 : 500;
    return NextResponse.json({ error: messageOf(error) }, { status });
  }
}

function parseInput(body: unknown) {
  const raw = (body ?? {}) as Record<string, unknown>;
  const subjectId = typeof raw.subjectId === "string" ? raw.subjectId : "";
  const week = Number(raw.week);
  if (!/^\d{1,12}$/.test(subjectId) || !Number.isInteger(week) || week < 1 || week > 60) {
    throw new Error("Choose a subject and a week.");
  }

  const notes = (Array.isArray(raw.notes) ? raw.notes : []).map((n) => ({
    title: typeof n?.title === "string" ? n.title.slice(0, 300) : "",
    content: typeof n?.content === "string" ? n.content : "",
  }));
  if (notes.length > 50 || notes.some((n) => n.content.length > 200_000)) {
    throw new Error("That's more notes than one review can take.");
  }
  if (!notes.some((n) => noteText(n.content).trim())) {
    throw new Error("Write some notes for this week first.");
  }
  return { subjectId, week, notes };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
