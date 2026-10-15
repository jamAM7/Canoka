// PUT    /api/calendar/sync  { url }  subscribe to a timetable's iCal link
// DELETE /api/calendar/sync          unsubscribe
// The link is saved to .env.local; the calendar fetches the feed itself when it
// loads (lib/data/timetable), so there's nothing to merge here.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { removeTimetableUrl, saveTimetableUrl } from "@/lib/data/timetable";

export async function PUT(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    const classes = await saveTimetableUrl(await request.json());
    return NextResponse.json({ saved: true, classes });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  removeTimetableUrl();
  return NextResponse.json({ removed: true });
}
