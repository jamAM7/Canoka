// A note's words without formatting, from the editor's JSON. This is what goes
// in notes.plain_text (search, and what the AI review reads): a line per
// paragraph, heading, list item or code block, and a table row on one line.
// Pure, so the server and the Notes page share it.

interface Node {
  type?: string;
  text?: string;
  content?: Node[];
}

/** Blocks whose children are text. Everything else is a container of blocks. */
const TEXT_BLOCKS = new Set(["paragraph", "heading", "codeBlock"]);
/** A guard against a pathological document, not a limit real notes reach. */
const MAX_DEPTH = 100;

export function docText(doc: unknown): string {
  return lines(doc as Node, 0).join("\n").trimEnd();
}

function lines(node: Node, depth: number): string[] {
  if (!node || typeof node !== "object" || depth > MAX_DEPTH) return [];
  if (node.type && TEXT_BLOCKS.has(node.type)) return [inline(node)];
  if (node.type === "tableRow") {
    return [(node.content ?? []).map((cell) => lines(cell, depth + 1).join(" ")).join(" ")];
  }
  if (typeof node.text === "string") return [node.text];
  return (node.content ?? []).flatMap((child) => lines(child, depth + 1));
}

function inline(node: Node): string {
  return (node.content ?? [])
    .map((child) => {
      if (typeof child.text === "string") return child.text;
      if (child.type === "hardBreak") return "\n";
      return inline(child);
    })
    .join("");
}
