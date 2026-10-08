// AI subtasks for assessments.
//
//   POST /api/subtasks/generate  { assignmentId?: uuid, regenerate?: boolean }
//     Breaks assessments into subtasks with Claude, schedules them on the
//     student's calendar between now and each deadline, and saves them as
//     study_tasks in their AI study plan. The calendar shows them under the
//     assessment, so reload it afterwards (router.refresh()).
//
//     With no `assignmentId` it does every assessment that qualifies (due in the
//     future, not a total row like "Final Mark", weight >= 10% and points > 2 where
//     those are known, with a brief), soonest deadline first, at most 10 a request.
//     With one, it does that assessment whatever its weight. An assessment that
//     already has AI subtasks is skipped unless `regenerate` is true, which
//     REPLACES them, completed ones included: ask the student first.
//
//       -> 200 { created:  [{ assignmentId, name, count, tight, dropped, replaced, warning? }],
//                skipped:  [{ assignmentId, name, reason }],
//                failed:   [{ assignmentId, name, error }],      error is fit to show
//                remaining: number }                              qualified, but past the cap: call again
//     reason is one of: not_an_assessment, no_due_date, past_due, below_threshold, no_brief,
//     already_has_tasks, too_soon. SKIP_LABELS in lib/subtasks/types turns them into words.
//     `tight`: the days before the deadline couldn't hold full-length sessions, so some were
//     shortened (or, if `dropped` > 0, left out).
//
//     It takes a while (one Claude call per assessment, three at a time): expect a minute or two for ten.
//     Errors are { error: string }: 400 bad body, 404 not the student's assessment, 409 already
//     running, 500. Claude failing for one assessment is a `failed` entry, not an error.
//     It calls the Anthropic API with the key on this machine, so lib/guard limits it to local development.
import { NextResponse } from "next/server";
import { refuseUnlessLocal } from "@/lib/guard";
import { currentUser } from "@/lib/data/user";
import { failure, optionalJson } from "@/lib/data/http";
import { generateSubtasks, parseGenerateInput } from "@/lib/data/subtasks";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = refuseUnlessLocal(request);
  if (refused) return refused;

  try {
    // An empty body means "every assessment that qualifies".
    const input = parseGenerateInput(await optionalJson(request));
    const user = await currentUser();
    return NextResponse.json(await generateSubtasks(user, input));
  } catch (error) {
    return failure(error);
  }
}
