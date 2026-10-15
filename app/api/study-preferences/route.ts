// The student's study hours, from Settings › Study hours: when AI subtasks go on the calendar.
//   GET /api/study-preferences                                      -> { hours: StudyHours }
//   PUT /api/study-preferences  { start, end, maxDailyMinutes, studyDays }
//                                                                    -> { hours }
//       start and end are "HH:MM" local time, end after start on the same day;
//       studyDays are 1 (Monday) ... 7 (Sunday). Subtasks already on the
//       calendar stay where they are: regenerating them uses the new hours.
// Without saved hours, GET gives the defaults the scheduler uses.
// Errors are { error: string }: 400 to show, 500 anything else.
// lib/guard only checks the request came from this app.
import { NextResponse } from "next/server";
import { requireSameOrigin } from "@/lib/guard";
import { failure, readJson } from "@/lib/data/http";
import { saveStudyHours, studyHours } from "@/lib/data/study-preferences";
import { currentUser } from "@/lib/data/user";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const refused = requireSameOrigin(request);
  if (refused) return refused;

  try {
    const user = await currentUser();
    return NextResponse.json({ hours: await studyHours(user.id) });
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
    return NextResponse.json({ hours: await saveStudyHours(user.id, input) });
  } catch (error) {
    return failure(error);
  }
}
