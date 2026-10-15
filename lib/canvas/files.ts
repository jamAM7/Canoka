import "server-only";
import { CanvasError, MAX_WORKERS, mapLimit, type CanvasClient } from "./client";
import { htmlToMarkdown } from "./markdown";
import type { SubjectDocument } from "./subject";

// Canvas files (lecture slides, readings, assessment briefs) as text, so the AI
// review can check notes against what's in them: the job
// scraper/canvas/content.py's file_to_text does for scrape.py --extract.
// PDFs, Word (.docx) and PowerPoint (.pptx) files and plain text are read;
// anything else (video, images, zip, the old binary .doc and .ppt) is skipped.
// Only the text is kept (lib/data/canvas-files), never the file.

/** Bigger than this is a scanned book or a recording, not a reading worth downloading. */
const MAX_BYTES = 20 * 1024 * 1024;
/** Text kept per file: a long chapter, but not a whole textbook. */
const MAX_TEXT_CHARS = 50_000;
const DOWNLOAD_TIMEOUT_MS = 20_000;

/** A Canvas file a subject points at, by id. */
export interface KnownFile {
  id: string;
  /** From the module item or the link's text; replaced by Canvas's own name once read. */
  name: string | null;
}

export type FileStatus = "read" | "empty" | "skipped" | "failed";

/** What's known of a file's text, as lib/data/canvas-files keeps it. */
export interface FileText {
  name: string | null;
  status: "pending" | FileStatus;
  text: string | null;
  note: string | null;
}

export interface FileRead {
  status: FileStatus;
  name: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  text: string | null;
  /** Why it was skipped or failed, or that its text was cut short. */
  note: string | null;
}

interface CanvasFile {
  display_name?: string | null;
  filename?: string | null;
  "content-type"?: string | null;
  size?: number | null;
  /** Pre-signed: it downloads without the token, and expires. */
  url?: string | null;
  locked_for_user?: boolean;
}

type Kind = "pdf" | "docx" | "pptx" | "text" | "html";

// ------------------------------------------------------------ finding files

/**
 * Canvas files linked from markdown, in order, once each, named by their link
 * text. Images shown in a page (![alt](url)) are left out: they're pictures,
 * not readings.
 */
export function linkedFiles(markdown: string | null | undefined, baseUrl: string): KnownFile[] {
  const host = new URL(baseUrl).host;
  const found = new Map<string, string | null>();
  const links = /(!?)\[([^\]]*)\]\((\S+?)(?:\s+"[^"]*")?\)|(https?:\/\/[^\s)"'<>\]]+)/g;
  for (const match of Array.from((markdown ?? "").matchAll(links))) {
    if (match[1] === "!") continue;
    const id = canvasFileId(match[3] ?? match[4], host);
    if (id && !found.has(id)) found.set(id, match[2]?.replace(/\\(.)/g, "$1").trim() || null);
  }
  return Array.from(found, ([id, name]) => ({ id, name }));
}

/** The file id in a link to a file on this Canvas, else null. */
function canvasFileId(link: string, host: string): string | null {
  try {
    const url = new URL(link);
    return url.host === host ? (/\/files\/(\d+)/.exec(url.pathname)?.[1] ?? null) : null;
  } catch {
    return null;
  }
}

/**
 * Every file a subject points at: its module File items, the files its
 * assessment briefs link to, and the files linked from the pages its modules
 * list (fetched here, a few at a time; a page that can't be read is passed over).
 */
export async function subjectFiles(client: CanvasClient, document: SubjectDocument): Promise<KnownFile[]> {
  const files = new Map<string, string | null>();
  const add = (list: KnownFile[]) => list.forEach((f) => files.set(f.id, files.get(f.id) ?? f.name));

  for (const module of document.modules) {
    add(module.items.filter((i) => i.type === "File" && i.content_id).map((i) => ({ id: i.content_id!, name: i.title })));
  }
  for (const assessment of document.assessments) add(linkedFiles(assessment.brief, client.baseUrl));

  const slugs = Array.from(new Set(document.modules.flatMap((m) => m.items.flatMap((i) => (i.page_url ? [i.page_url] : [])))));
  const bodies = await mapLimit(slugs, MAX_WORKERS, async (slug) => {
    try {
      const page = await client.get<{ body?: string | null }>(
        `/api/v1/courses/${document.subject.course_id}/pages/${encodeURIComponent(slug)}`,
      );
      return htmlToMarkdown(page.body, client.baseUrl);
    } catch (error) {
      if (error instanceof CanvasError && !error.badToken) return "";
      throw error;
    }
  });
  for (const body of bodies) add(linkedFiles(body, client.baseUrl));

  return Array.from(files, ([id, name]) => ({ id, name }));
}

// ------------------------------------------------------------ reading one

/**
 * One file's text. Throws only when it should be tried again later (Canvas or
 * the download failed); a file that can't or shouldn't be read is "skipped".
 */
export async function readCanvasFile(client: CanvasClient, id: string): Promise<FileRead> {
  let file: CanvasFile;
  try {
    file = await client.get<CanvasFile>(`/api/v1/files/${id}`);
  } catch (error) {
    if (error instanceof CanvasError && !error.badToken && (error.forbidden || error.status === 404)) {
      return outcome("skipped", {}, "Canvas won't give you this file");
    }
    throw error;
  }

  const kind = kindOf(file["content-type"], file.display_name || file.filename);
  const size = file.size ?? null;
  if (!kind) return outcome("skipped", file, `not a document (${file["content-type"] || "unknown type"})`);
  if (size !== null && size > MAX_BYTES) return outcome("skipped", file, `too big to read (${megabytes(size)})`);
  if (file.locked_for_user || !file.url) return outcome("skipped", file, "locked in Canvas");

  const bytes = await download(file.url);
  let text = (await extract(kind, bytes, client.baseUrl)).replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return outcome("empty", file, kind === "pdf" ? "no text in it: probably a scan" : "no text in it");
  let note: string | null = null;
  if (text.length > MAX_TEXT_CHARS) {
    text = text.slice(0, MAX_TEXT_CHARS);
    note = `cut at ${MAX_TEXT_CHARS.toLocaleString("en")} characters`;
  }
  return { ...outcome("read", file, note), text };
}

function outcome(status: FileStatus, file: CanvasFile, note: string | null): FileRead {
  return {
    status,
    name: file.display_name || file.filename || null,
    contentType: file["content-type"] || null,
    sizeBytes: file.size ?? null,
    text: null,
    note,
  };
}

function kindOf(contentType: string | null | undefined, name: string | null | undefined): Kind | null {
  const type = (contentType ?? "").toLowerCase();
  const extension = /\.([a-z0-9]+)$/i.exec(name ?? "")?.[1]?.toLowerCase() ?? "";
  if (type === "application/pdf" || extension === "pdf") return "pdf";
  if (type.includes("wordprocessingml.document") || extension === "docx") return "docx";
  if (type.includes("presentationml.presentation") || extension === "pptx") return "pptx";
  if (type === "text/html" || extension === "html" || extension === "htm") return "html";
  if (type.startsWith("text/") || ["txt", "md", "csv"].includes(extension)) return "text";
  return null;
}

/** The file's bytes, without the token: Canvas's file URL carries its own one-off permission. */
async function download(url: string): Promise<Uint8Array> {
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS) });
  if (!response.ok) throw new Error(`the download answered HTTP ${response.status}`);
  const length = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(length) && length > MAX_BYTES) throw new Error(`it's ${megabytes(length)}, too big to read`);
  return new Uint8Array(await response.arrayBuffer());
}

async function extract(kind: Kind, bytes: Uint8Array, baseUrl: string): Promise<string> {
  switch (kind) {
    case "pdf":
      return pdfText(bytes);
    case "docx": {
      // Imported here, not at the top: only a sync's file reading needs them.
      const { default: mammoth } = await import("mammoth");
      return (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
    }
    case "pptx":
      return pptxText(bytes);
    case "html":
      return htmlToMarkdown(new TextDecoder("utf-8").decode(bytes), baseUrl);
    case "text":
      return new TextDecoder("utf-8").decode(bytes);
  }
}

/** A PDF's text, page by page, as "[page N]" sections. */
async function pdfText(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // Errors only: PDF.js otherwise logs a warning for every odd font.
  const pdf = await getDocumentProxy(bytes, { verbosity: 0 });
  try {
    const { text } = await extractText(pdf, { mergePages: false });
    return text
      .map((page, i) => (page.trim() ? `[page ${i + 1}]\n${page.trim()}` : ""))
      .filter(Boolean)
      .join("\n\n");
  } finally {
    // Frees the parsed document: a reading can be tens of megabytes in memory.
    await pdf.loadingTask.destroy();
  }
}

/** A deck's text, slide by slide, with the speaker notes: often where the real explanation lives. */
async function pptxText(bytes: Uint8Array): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(bytes);
  const read = async (path: string) => (await zip.file(path)?.async("string")) ?? "";
  const slides = Object.keys(zip.files)
    .flatMap((path) => {
      const number = /^ppt\/slides\/slide(\d+)\.xml$/.exec(path)?.[1];
      return number ? [Number(number)] : [];
    })
    .sort((a, b) => a - b);

  const parts: string[] = [];
  for (const number of slides) {
    const lines = paragraphs(await read(`ppt/slides/slide${number}.xml`));
    // The slide's notes are a separate part, which the slide's relationships name.
    const notesPath = /Target="\.\.\/notesSlides\/(notesSlide\d+\.xml)"/.exec(await read(`ppt/slides/_rels/slide${number}.xml.rels`))?.[1];
    const notes = notesPath ? paragraphs(await read(`ppt/notesSlides/${notesPath}`)).filter((line) => !/^\d+$/.test(line)) : [];
    if (notes.length > 0) lines.push(`Notes: ${notes.join("\n")}`);
    if (lines.length > 0) parts.push(`[slide ${number}]\n${lines.join("\n")}`);
  }
  return parts.join("\n\n");
}

/** The text of each <a:p> paragraph in a slide's XML, keeping its <a:br/> line breaks. */
function paragraphs(xml: string): string[] {
  const runs = (part: string) => Array.from(part.matchAll(/<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g), (m) => decodeXml(m[1])).join("");
  return xml
    .split("</a:p>")
    .map((p) => p.split(/<a:br\b[^>]*\/>/).map(runs).join("\n").trim())
    .filter(Boolean);
}

function decodeXml(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, entity: string) => {
    const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
    if (entity[0] !== "#") return named[entity.toLowerCase()] ?? whole;
    const code = entity[1] === "x" || entity[1] === "X" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
  });
}

function megabytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
