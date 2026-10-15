// PUT    /api/calendar/sync  { url }  subscribe to a timetable's iCal link
// DELETE /api/calendar/sync          unsubscribe
// The link is saved on the student's users row (lib/data/timetable); the
// calendar fetches the feed itself when it loads, so there's nothing to merge
// here. lib/guard only checks the request came from this app.
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/guard";
import { failure, readJson } from "@/lib/data/http";
import { removeTimetableUrl, saveTimetableUrl } from "@/lib/data/timetable";
import { currentUser } from "@/lib/data/user";

export async function PUT(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const input = await readJson(request);
    const user = await currentUser();
    const classes = await saveTimetableUrl(user.id, input);
    return NextResponse.json({ saved: true, classes });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const user = await currentUser();
    await removeTimetableUrl(user.id);
    return NextResponse.json({ removed: true });
  } catch (error) {
    return failure(error);
  }
}
