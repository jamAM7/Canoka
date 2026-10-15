import "server-only";
import TurndownService from "turndown";

// Canvas rich content (page bodies, assessment briefs, quiz and discussion
// text) as markdown, the way scraper/canvas/content.py's html_to_markdown makes
// it: ATX headings, "-" bullets, scripts and styles dropped, and every link
// made absolute with Canvas's file-access tokens taken out.
//
// Tables stay tables, header-less ones included, with the first row as the
// header as markdownify does: marking criteria are nearly always a table.
// turndown-plugin-gfm would keep a header-less table as raw HTML, and its
// links would then skip the clean-up below.

/**
 * Query parameters dropped from every link. Canvas adds `verifier` to file
 * links, and it downloads the file with no sign-in at all; `wrap` only asks
 * for Canvas's preview chrome.
 */
const DROP_PARAMS = new Set(["verifier", "wrap"]);

/** Canvas HTML as markdown, or "" for none. */
export function htmlToMarkdown(html: string | null | undefined, baseUrl: string): string {
  if (!html?.trim()) return "";
  const markdown = converter(baseUrl).turndown(html);
  return markdown.replace(/\n{3,}/g, "\n\n").trim();
}

/** A link from Canvas HTML made absolute against the Canvas site, without its access tokens. */
function cleanUrl(value: string, baseUrl: string): string {
  const raw = value.trim();
  if (!raw || raw.startsWith("#") || /^mailto:/i.test(raw)) return raw;
  let url: URL;
  try {
    url = new URL(raw, `${baseUrl}/`);
  } catch {
    return raw;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return raw;
  for (const key of Array.from(url.searchParams.keys())) {
    if (DROP_PARAMS.has(key.toLowerCase())) url.searchParams.delete(key);
  }
  return url.toString();
}

function converter(baseUrl: string): TurndownService {
  const service = new TurndownService({
    headingStyle: "atx",
    bulletListMarker: "-",
    emDelimiter: "*",
    codeBlockStyle: "fenced",
  });
  service.remove(["script", "style"]);

  // "- item" and "1. item" as markdownify writes them, where turndown pads the marker to four characters.
  service.addRule("listItem", {
    filter: "li",
    replacement: (content, node) => {
      const parent = node.parentNode as HTMLElement | null;
      let prefix = "- ";
      if (parent?.nodeName === "OL") {
        const start = parent.getAttribute("start");
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start ? Number(start) + index : index + 1}. `;
      }
      const paragraph = /\n$/.test(content);
      const body = content.replace(/^\n+|\n+$/g, "") + (paragraph ? "\n" : "");
      return prefix + body.replace(/\n/g, `\n${" ".repeat(prefix.length)}`) + (node.nextSibling ? "\n" : "");
    },
  });

  service.addRule("canvasLink", {
    filter: (node) => node.nodeName === "A" && Boolean(node.getAttribute("href")),
    replacement: (content, node) => {
      // An empty anchor, such as Canvas's file-preview icon, says nothing.
      if (!content.trim()) return "";
      const element = node as HTMLElement;
      const href = cleanUrl(element.getAttribute("href") ?? "", baseUrl).replace(/([()])/g, "\\$1");
      const title = element.getAttribute("title")?.replace(/\s+/g, " ").trim();
      return `[${content}](${href}${title ? ` "${title.replace(/"/g, '\\"')}"` : ""})`;
    },
  });

  service.addRule("canvasImage", {
    filter: "img",
    replacement: (_content, node) => {
      const element = node as HTMLElement;
      const alt = (element.getAttribute("alt") ?? "").replace(/\s+/g, " ").trim();
      const src = cleanUrl(element.getAttribute("src") ?? "", baseUrl);
      // An inline data: image is base64 noise to a reader of the text: keep its alt text only.
      if (!src || !/^https?:/i.test(src)) return alt;
      return `![${alt}](${src.replace(/([()])/g, "\\$1")})`;
    },
  });

  service.addRule("tableCell", {
    filter: ["th", "td"],
    replacement: (content, node) => {
      const text = content.replace(/\s*\n+\s*/g, " ").replace(/\|/g, "\\|").trim();
      return isFirstElement(node) ? `| ${text} |` : ` ${text} |`;
    },
  });

  service.addRule("tableRow", {
    filter: "tr",
    replacement: (content, node) => {
      if (!isHeaderRow(node)) return `\n${content}`;
      const cells = elementChildren(node).filter((child) => child.nodeName === "TH" || child.nodeName === "TD");
      return `\n${content}\n|${cells.map(() => " --- |").join("")}`;
    },
  });

  service.addRule("tableSection", {
    filter: ["thead", "tbody", "tfoot"],
    replacement: (content) => content,
  });

  service.addRule("table", {
    filter: "table",
    replacement: (content) => `\n\n${content.replace(/^\n+/, "")}\n\n`,
  });

  return service;
}

function elementChildren(node: Node): Node[] {
  return Array.from(node.childNodes).filter((child) => child.nodeType === 1);
}

function isFirstElement(node: Node): boolean {
  return node.parentNode ? elementChildren(node.parentNode)[0] === node : true;
}

/** Whether a row is its table's first, which markdown needs to treat as the header. */
function isHeaderRow(row: Node): boolean {
  let table = row.parentNode;
  while (table && table.nodeName !== "TABLE") table = table.parentNode;
  if (!table) return false;
  for (const child of elementChildren(table)) {
    if (child.nodeName === "TR") return child === row;
    if (child.nodeName === "THEAD" || child.nodeName === "TBODY" || child.nodeName === "TFOOT") {
      const first = elementChildren(child).find((r) => r.nodeName === "TR");
      if (first) return first === row;
    }
  }
  return false;
}
