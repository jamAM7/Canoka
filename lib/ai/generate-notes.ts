import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { NoteDoc } from "@/lib/notes/types";
import type { LearningProfile } from "@/lib/user/learning-profile";
import { anthropicKey } from "./key";
import { describe } from "./review";

// Claude returns a constrained outline. We convert it to TipTap JSON ourselves
// so generated notes open in the same editable rich-text editor as typed notes.
const GeneratedNote = z.object({
  title: z.string().describe("A short, specific title for this week's study notes."),
  overview: z.string().describe("A concise overview of the week's main theme and how its ideas connect."),
  sections: z.array(
    z.object({
      heading: z.string().describe("A specific concept or topic heading."),
      explanation: z.string().describe("A clear explanation grounded only in the supplied course content."),
      keyPoints: z.array(z.string()).describe("Important facts, steps, relationships, or takeaways."),
      examples: z.array(z.string()).describe("Examples present in or directly supported by the content."),
    }),
  ),
  keyTerms: z.array(z.object({ term: z.string(), definition: z.string() })),
  selfCheck: z.array(z.string()).describe("Short questions answered by the generated notes."),
});

type GeneratedNote = z.infer<typeof GeneratedNote>;

export interface GenerateNotesRequest {
  subject: string;
  week: number;
  weekTitle: string | null;
  weekContent: string;
  learningProfile?: LearningProfile | null;
}

export interface GeneratedNoteResult {
  title: string;
  content: NoteDoc;
  model: string;
}

export class NoteGenerationError extends Error {}

// Note generation is mostly extraction and organisation. Sonnet at low effort
// is substantially quicker here while structured output keeps the result
// complete and editable.
const MODEL = "claude-sonnet-5-5";
const SYSTEM = `You turn one teaching week's Canvas material into accurate, editable study notes.

Use only the supplied course content. Do not invent facts, examples, requirements, or explanations that the material does not support. Organise related ideas, explain important concepts plainly, preserve useful details, and call out relationships or sequences. Omit navigation text, repeated boilerplate, and administrative clutter unless it affects the student's work. The result should help the student learn the material, not merely list document titles.`;

export async function generateNotes(request: GenerateNotesRequest): Promise<GeneratedNoteResult> {
  const key = anthropicKey();
  const client = new Anthropic(key ? { apiKey: key } : {});
  const week = request.weekTitle ? `Week ${request.week}: ${request.weekTitle}` : `Week ${request.week}`;

  let response;
  try {
    response = await client.beta.messages.parse({
      model: MODEL,
      max_tokens: 8000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(GeneratedNote) },
      system: SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `<course_content>\n${request.weekContent}\n</course_content>`,
              cache_control: { type: "ephemeral" },
            },
            {
              type: "text",
              text: `Subject: ${request.subject}\n${week}\n\n${profileInstruction(request.learningProfile)}\n\nCreate comprehensive but readable study notes from the course content above.`,
            },
          ],
        },
      ],
    });
  } catch (error) {
    throw new NoteGenerationError(describe(error, key));
  }

  if (response.stop_reason === "refusal") throw new NoteGenerationError("Claude declined to generate these notes.");
  if (response.stop_reason === "max_tokens") throw new NoteGenerationError("The generated notes ran too long to finish. Try again.");
  if (!response.parsed_output) throw new NoteGenerationError("The generated notes came back unreadable. Try again.");

  return {
    title: response.parsed_output.title.trim().slice(0, 300) || `${week} study notes`,
    content: toNoteDoc(response.parsed_output),
    model: response.model || MODEL,
  };
}

function profileInstruction(profile: LearningProfile | null | undefined): string {
  if (!profile) return "Write for a university student using clear explanations and useful structure.";
  const modes = profile.learningModes.length ? profile.learningModes.join(", ") : "clear explanations";
  return `Adapt the notes to these preferences without mentioning the profile: study level ${profile.studyLevel ?? "university"}; goal ${profile.studyGoal ?? "understanding"}; preferred approaches ${modes}; depth ${profile.noteDepth ?? "balanced"}; support ${profile.supportStyle ?? "guided"}.`;
}

function toNoteDoc(note: GeneratedNote): NoteDoc {
  const content: NonNullable<NoteDoc["content"]> = [];
  if (note.overview.trim()) content.push(paragraph(note.overview));

  for (const section of note.sections) {
    if (!section.heading.trim() || !section.explanation.trim()) continue;
    content.push(heading(section.heading, 2), paragraph(section.explanation));
    if (section.keyPoints.length) content.push(heading("Key points", 3), bulletList(section.keyPoints));
    if (section.examples.length) content.push(heading("Examples", 3), bulletList(section.examples));
  }

  if (note.keyTerms.length) {
    content.push(heading("Key terms", 2), bulletList(note.keyTerms.map(({ term, definition }) => `${term}: ${definition}`)));
  }
  if (note.selfCheck.length) content.push(heading("Check your understanding", 2), bulletList(note.selfCheck));
  return { type: "doc", content };
}

const text = (value: string) => ({ type: "text", text: value.trim() });
const paragraph = (value: string) => ({ type: "paragraph", content: [text(value)] });
const heading = (value: string, level: 2 | 3) => ({ type: "heading", attrs: { level }, content: [text(value)] });
const bulletList = (items: string[]) => ({
  type: "bulletList",
  content: items
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => ({ type: "listItem", content: [paragraph(item)] })),
});
