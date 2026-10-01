import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { anthropicKey } from "./key";

// Reviews a student's notes for one week of a subject against what Canvas
// holds for that week, with Claude. Server-only.

export const NotesReview = z.object({
  summary: z
    .string()
    .describe("Two or three sentences: how well the notes cover the week, and the most useful thing to do next."),
  covered: z.array(z.string()).describe("Key ideas from the week that the notes capture well. Short phrases."),
  missing: z
    .array(z.string())
    .describe("Important ideas in the week's course content that the notes leave out or barely touch, most important first."),
  corrections: z
    .array(z.string())
    .describe("Anything in the notes that is wrong or misleading, each with the correction. Empty if nothing is."),
  questions: z.array(z.string()).describe("Three to five short questions that check understanding of this week."),
});
export type NotesReview = z.infer<typeof NotesReview>;

export interface ReviewRequest {
  /** e.g. "41201 Designing Sustainable Engineering Projects". */
  subject: string;
  week: number;
  weekTitle: string | null;
  /** The week's Canvas content as markdown, from course_content, or null if there is none stored. */
  weekContent: string | null;
  /** The student's notes for the week; `content` is plain text (notes.plain_text). */
  notes: { title: string; content: string }[];
}

export interface ReviewResult {
  review: NotesReview;
  /** The model that answered, which can differ from MODEL when a declined request is retried. */
  model: string;
}

/** A failure with a message fit to show the student. */
export class ReviewError extends Error {}

const MODEL = "claude-opus-5-5";

const SYSTEM = `You review a university student's study notes for one week of a subject.

Compare the notes with that week's course content from Canvas. Tell the student what they've captured well, what important material is missing, and anything in the notes that is wrong. Judge coverage only against the course content you're given. When there is none, say coverage can't be checked, and review the notes on their own: clarity, accuracy, and gaps a student of the subject would want filled.

Be specific: name the actual concepts, never just "add more detail". Write to the student as "you", plainly and briefly.`;

export async function reviewNotes(request: ReviewRequest): Promise<ReviewResult> {
  const key = anthropicKey();
  const client = new Anthropic(key ? { apiKey: key } : {});
  const week = request.weekTitle ? `Week ${request.week}: ${request.weekTitle}` : `Week ${request.week}`;
  const notes = request.notes
    .map((n) => `<note title="${(n.title || "Untitled").replace(/"/g, "&quot;")}">\n${n.content}\n</note>`)
    .join("\n\n");

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      // A declined request is retried server-side on the model Anthropic recommends for it.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      // Medium effort is enough to check one week of notes, and keeps the wait short.
      output_config: { effort: "medium", format: betaZodOutputFormat(NotesReview) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              // The course content stays the same when the student edits and asks again, so
              // it goes first and is cached; the notes, which change, come after it.
              text: request.weekContent
                ? `<course_content>\n${request.weekContent}\n</course_content>`
                : `<course_content>None. No course content is stored for ${week} of this subject.</course_content>`,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `Subject: ${request.subject}\n${week}\n\nThe student's notes for this week, as plain text:\n\n<notes>\n${notes}\n</notes>`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    throw new ReviewError(describe(error, key));
  }

  if (response.stop_reason === "refusal") throw new ReviewError("Claude declined to review these notes.");
  if (response.stop_reason === "max_tokens") throw new ReviewError("The review ran too long to finish. Try again.");
  if (!response.parsed_output) throw new ReviewError("The review came back unreadable. Try again.");
  return { review: response.parsed_output, model: response.model || MODEL };
}

function describe(error: unknown, key: string | null): string {
  if (error instanceof Anthropic.AuthenticationError) {
    return "Anthropic rejected the API key. Check it in Settings.";
  }
  if (error instanceof Anthropic.RateLimitError) return "Anthropic is busy right now. Try again in a minute.";
  if (error instanceof Anthropic.APIConnectionError) return "Couldn't reach Anthropic. Check your connection.";
  if (error instanceof Anthropic.APIError) return `Anthropic returned an error (${error.status}): ${error.message}`;
  if (!key) return "Add your Anthropic API key in Settings to use AI review.";
  return error instanceof Error ? error.message : String(error);
}
