// GET /api/scraper/week?subject=<course id>&week=<n>
// One week of a subject's Canvas content as markdown, from the last scrape
// (scraper/week.py). `markdown` is null when nothing in the scrape names the week.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { loadWeekContent } from "@/lib/scraper/week";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  const params = new URL(request.url).searchParams;
  const subject = params.get("subject") ?? "";
  const week = Number(params.get("week"));
  if (!/^\d{1,12}$/.test(subject) || !Number.isInteger(week) || week < 1 || week > 60) {
    return NextResponse.json({ error: "Choose a subject and a week." }, { status: 400 });
  }

  try {
    return NextResponse.json({ markdown: await loadWeekContent(subject, week) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
