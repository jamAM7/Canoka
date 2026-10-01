// AI review of a student's notes for one week of a subject.
//
//   POST /api/notes/review  { courseId, week, refresh? }
//     Does everything in order: scrapes the week from Canvas and saves it as
//     course_content, reads the week's notes (plain_text) and content from the
//     database, has Claude compare them, stores the result in week_reviews and
//     returns it. It can take a minute or two. Save any edits first: it reads
//     the notes from the database.
//       -> 200 { review: WeekReviewDto,            (lib/notes/types)
//                contentStale: boolean,            true: Canvas couldn't be reached, so the
//                                                  content already stored was used. It may be out of date.
//                staleReason: string | null,       why, when contentStale
//                contentUpdatedAt: string | null } when the week's content was last saved
//     `courseId` is a subject's id and `week` the week number, both from GET /api/notes
//     (`subjects[].id`, `subjects[].weeks[].number`). `refresh: true` makes the scrape ask
//     Canvas again instead of using what it cached (pages and modules last a week); slower.
//
//   GET /api/notes/review?courseId=<uuid>&week=<n>
//       -> 200 { review: WeekReviewDto | null }     the week's latest stored review
//
// Errors are { error: string }: 400 bad request or no notes for the week, 404 not the
// student's subject or the week isn't synced yet, 409 this week is already being reviewed,
// 502 Claude failed (the message is fit to show), 500 anything else.
// It runs Python on this machine and uses the API key here, so lib/guard limits it to local development.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { ReviewError } from "@/lib/ai/review";
import { currentUser } from "@/lib/data/user";
import { failure, readJson } from "@/lib/data/http";
import { latestWeekReview, parseReviewInput, parseWeekRef, reviewWeek } from "@/lib/data/week-review";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    const input = parseReviewInput(await readJson(request));
    const user = await currentUser();
    const { review, staleReason } = await reviewWeek(user.id, input);
    return NextResponse.json({
      review,
      contentStale: review.contentStale,
      staleReason,
      contentUpdatedAt: review.contentUpdatedAt,
    });
  } catch (error) {
    if (error instanceof ReviewError) return NextResponse.json({ error: error.message }, { status: 502 });
    return failure(error);
  }
}

export async function GET(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    const params = new URL(request.url).searchParams;
    const ref = parseWeekRef(params.get("courseId"), params.get("week"));
    const user = await currentUser();
    return NextResponse.json({ review: await latestWeekReview(user.id, ref) });
  } catch (error) {
    return failure(error);
  }
}
