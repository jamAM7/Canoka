import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { PlannedSubtask } from "@/lib/subtasks/schedule";
import { anthropicKey } from "./key";
import { ReviewError, describe as describeApiError } from "./review";

// Breaks one assessment into study subtasks with Claude. Server-only.
//
// Claude decides what the subtasks are, how long each takes, and how many
// days before the deadline each should be finished. It does not pick dates or
// times: lib/subtasks/schedule does, from the student's calendar and window.

export const MODEL = "claude-sonnet-5-5";
/** From the 4-10 asked for: fewer for a small assessment, never more than this. */
const MAX_SUBTASKS = 10;

// No numeric ranges here: structured outputs don't enforce them. cleanPlan() does.
export const SubtaskPlan = z.object({
  subtasks: z
    .array(
      z.object({
        title: z.string().describe("Three to eight words, starting with a verb."),
        description: z.string().describe("One or two sentences: what finished looks like."),
        minutes: z.number().int().describe("Realistic working time for one sitting, between 20 and 180."),
        days_before_due: z
          .number()
          .int()
          .describe("How many days before the due date this should be finished. 0 is the due day itself."),
      }),
    )
    .describe("Four to ten subtasks, in the order to do them. Fewer for a small assessment."),
});
export type SubtaskPlan = z.infer<typeof SubtaskPlan>;

export interface SubtaskContext {
  /** e.g. "41129 Software Innovation Studio". */
  subject: string;
  name: string;
  weight: number | null;
  points: number | null;
  /** The deadline as the student reads it, in their timezone. */
  dueLabel: string;
  todayLabel: string;
  /** Calendar days from today to the due day, both included. */
  daysAvailable: number;
  /** The brief, with the marking criteria if they're stored. */
  text: string;
}

const SYSTEM = `You break one university assessment into a short sequence of study subtasks for a student.

Each subtask is one sitting of 20 to 180 minutes with a concrete outcome, so the student can tell when it's done. Put them in the order to do them: understand the brief and the marking criteria, gather or read what's needed, draft or build, test or revise, and finish with a review and a check that everything is ready to submit. Where marking criteria are given, make sure the work covers what is marked.

Say how many days before the due date each subtask should be finished: 0 is the due day itself, and the request states the largest value allowed. Spread the work over the days available, and leave the last day or two for checking and submitting. Size the plan to the assessment: a small quiz needs a few subtasks, a large project needs more.

Use only what the brief says. Don't invent requirements, tools or deliverables it doesn't mention. Write plainly, to the student.`;

export function buildPrompt(ctx: SubtaskContext): string {
  const facts = [
    ctx.weight !== null ? `weight ${ctx.weight}%` : null,
    ctx.points !== null ? `${ctx.points} points` : null,
  ].filter(Boolean);
  return [
    `Subject: ${ctx.subject}`,
    `Assessment: ${ctx.name}${facts.length > 0 ? ` (${facts.join(", ")})` : ""}`,
    `Due: ${ctx.dueLabel}`,
    `Today: ${ctx.todayLabel}`,
    `Days available: ${ctx.daysAvailable}, counting today and the due day. days_before_due can be at most ${Math.max(0, ctx.daysAvailable - 1)}.`,
    "",
    "<assessment>",
    ctx.text,
    "</assessment>",
  ].join("\n");
}

/** Subtasks for one assessment. Throws a ReviewError, with a message fit to show, if Claude can't. */
export async function planSubtasks(ctx: SubtaskContext, client?: Anthropic): Promise<PlannedSubtask[]> {
  const key = anthropicKey();
  const anthropic = client ?? new Anthropic(key ? { apiKey: key } : {});

  let response;
  try {
    // create(), not parse(): parse() throws on a refusal's partial text before stop_reason can be read.
    response = await anthropic.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      // A declined request is retried server-side on the model Anthropic recommends for it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Low effort: the planning is routine, and the dates are worked out in code.
      output_config: { effort: "low", format: betaZodOutputFormat(SubtaskPlan) },
      system: SYSTEM,
      messages: [{ role: "user", content: buildPrompt(ctx) }],
    });
  } catch (error) {
    throw new ReviewError(describeApiError(error, key));
  }

  if (response.stop_reason === "refusal") throw new ReviewError("Claude declined to plan this assessment.");
  if (response.stop_reason === "max_tokens") throw new ReviewError("The plan ran too long to finish. Try again.");

  let plan: SubtaskPlan;
  try {
    const text = response.content.flatMap((block) => (block.type === "text" ? [block.text] : [])).join("");
    plan = SubtaskPlan.parse(JSON.parse(text));
  } catch {
    throw new ReviewError("The plan came back unreadable. Try again.");
  }

  const planned = cleanPlan(plan, Math.max(0, ctx.daysAvailable - 1));
  if (planned.length === 0) throw new ReviewError("Claude didn't suggest any subtasks for this assessment.");
  return planned;
}

/** Claude's plan made safe to schedule: trimmed text, sensible lengths, days within the window, at most MAX_SUBTASKS. */
export function cleanPlan(plan: SubtaskPlan, maxDaysBefore: number): PlannedSubtask[] {
  return plan.subtasks
    .map((s) => ({
      title: s.title.trim().slice(0, 120),
      description: s.description.trim().slice(0, 500),
      minutes: Number.isFinite(s.minutes) ? s.minutes : 60,
      daysBeforeDue: Number.isFinite(s.days_before_due) ? Math.min(maxDaysBefore, Math.max(0, Math.round(s.days_before_due))) : 0,
    }))
    .filter((s) => s.title !== "")
    .slice(0, MAX_SUBTASKS);
}
