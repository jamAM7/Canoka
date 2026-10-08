import { SKIP_LABELS, type GenerateResult, type SkipReason } from "./types";

// The one line the Calendar button shows after generating subtasks, e.g.
// "Added 14 subtasks to 3 assessments. Skipped 26: 20 past due, 5 no due date, 1 not an assessment."

export interface Summary {
  text: string;
  /** Nothing was made and something went wrong. */
  error: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** Skip reasons with how many assessments each, most first. */
export function skipCounts(skipped: GenerateResult["skipped"]): [SkipReason, number][] {
  const counts = new Map<SkipReason, number>();
  for (const s of skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1);
  return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
}

export function summarise(r: GenerateResult): Summary {
  const parts: string[] = [];

  const added = r.created.reduce((n, c) => n + c.count, 0);
  if (r.created.length > 0) parts.push(`Added ${plural(added, "subtask")} to ${plural(r.created.length, "assessment")}.`);
  const replaced = r.created.reduce((n, c) => n + c.replaced, 0);
  if (replaced > 0) parts.push(`Replaced ${plural(replaced, "earlier subtask")}.`);
  const tight = r.created.filter((c) => c.tight).length;
  if (tight > 0) parts.push(`${plural(tight, "assessment")} had little time, so some sessions are shorter or left out.`);
  for (const c of r.created) if (c.warning) parts.push(`${c.name}: ${c.warning}`);

  if (r.skipped.length > 0) {
    const counts = skipCounts(r.skipped);
    // One reason reads "Skipped 20: past due"; several read "Skipped 26: 20 past due, 5 no due date".
    const why = counts.map(([reason, n]) => (counts.length === 1 ? SKIP_LABELS[reason] : `${n} ${SKIP_LABELS[reason]}`));
    parts.push(`Skipped ${r.skipped.length}: ${why.join(", ")}.`);
  }

  if (r.failed.length > 0) {
    const first = r.failed[0];
    parts.push(`${r.failed.length} failed. ${first.name}: ${first.error}`);
  }
  if (r.remaining > 0) parts.push(`${plural(r.remaining, "more assessment")} waiting. Press the button again.`);

  if (parts.length === 0) return { text: "No assessments to plan.", error: false };
  return { text: parts.join(" "), error: r.created.length === 0 && r.failed.length > 0 };
}
