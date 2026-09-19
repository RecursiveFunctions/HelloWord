import type { JSONContent } from "@tiptap/core";
import { normalizeMarkdown } from "../contracts/markdown";
import { parseBlocks, type Block } from "./blocks";

/**
 * Markdown <-> Tiptap conversion for the note editor.
 *
 * The note's canonical form is markdown; Tiptap is only a view over it. So the
 * save direction serializes ProseMirror's JSON document rather than scraping
 * the DOM. That keeps the corruption-prone half of the round trip free of any
 * browser dependency, which is the only reason it can be tested at all.
 */

const ALLOWED_LINK = /^(?:https?:|mailto:|#|\/)/i;

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Render inline markdown to HTML. Used only for the editor, never for the
 * reader's source pane, which must keep text verbatim to preserve offsets.
 */
function renderInline(text: string): string {
  return text
    .split(/(`[^`]+`)/g)
    .map((part) => {
      if (part.length > 2 && part.startsWith("`") && part.endsWith("`")) {
        return `<code>${escapeHtml(part.slice(1, -1))}</code>`;
      }
      let out = escapeHtml(part);
      out = out.replace(
        /\[([^\]]+)\]\(([^)\s]+)\)/g,
        (whole, label: string, href: string) =>
          ALLOWED_LINK.test(href) ? `<a href="${href}">${label}</a>` : whole,
      );
      out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
      out = out.replace(/~~([^~]+)~~/g, "<s>$1</s>");
      out = out.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
      // Intraword underscores are not emphasis, so snake_case survives intact.
      out = out.replace(/(^|[^\w\\])_([^_\n]+)_(?!\w)/g, "$1<em>$2</em>");
      return out;
    })
    .join("");
}

/** Join a paragraph's source lines, honouring backslash hard breaks. */
function joinLines(lines: string[]): string {
  let out = "";
  lines.forEach((line, i) => {
    const hardBreak = line.endsWith("\\");
    out += renderInline(hardBreak ? line.slice(0, -1) : line);
    if (i < lines.length - 1) out += hardBreak ? "<br>" : " ";
  });
  return out;
}

function blockToHtml(block: Block): string {
  switch (block.kind) {
    case "heading":
      return `<h${block.level}>${renderInline(block.span.text)}</h${block.level}>`;
    case "paragraph":
      return `<p>${joinLines(block.lines.map((l) => l.text))}</p>`;
    case "blockquote":
      return `<blockquote><p>${joinLines(block.lines.map((l) => l.text))}</p></blockquote>`;
    case "list": {
      const tag = block.ordered ? "ol" : "ul";
      const items = block.items
        .map((item) => `<li><p>${renderInline(item.text)}</p></li>`)
        .join("");
      return `<${tag}>${items}</${tag}>`;
    }
    case "code": {
      const cls = block.lang ? ` class="language-${escapeHtml(block.lang)}"` : "";
      return `<pre><code${cls}>${escapeHtml(block.lines.map((l) => l.text).join("\n"))}</code></pre>`;
    }
    case "hr":
      return "<hr>";
  }
}

/** Markdown to HTML for seeding Tiptap's initial content. */
export function markdownToHtml(markdown: string): string {
  const html = parseBlocks(markdown).map(blockToHtml).join("");
  return html || "<p></p>";
}

/** Escape the characters that would otherwise be read back as markdown syntax. */
function escapeMarkdown(text: string): string {
  return text.replace(/([\\*`[])/g, "\\$1");
}

function applyMarks(text: string, marks: JSONContent["marks"]): string {
  if (!marks?.length) return text;
  let out = text;
  // Code is innermost: its content is literal, so it is never escaped.
  if (marks.some((m) => m.type === "code")) out = `\`${out}\``;
  if (marks.some((m) => m.type === "bold")) out = `**${out}**`;
  if (marks.some((m) => m.type === "italic")) out = `*${out}*`;
  if (marks.some((m) => m.type === "strike")) out = `~~${out}~~`;
  const link = marks.find((m) => m.type === "link");
  const href = link?.attrs?.href;
  if (typeof href === "string" && ALLOWED_LINK.test(href)) out = `[${out}](${href})`;
  return out;
}

function inlineToMarkdown(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map((node) => {
      if (node.type === "hardBreak") return "\\\n";
      if (node.type !== "text" || typeof node.text !== "string") return "";
      const isCode = node.marks?.some((m) => m.type === "code");
      return applyMarks(isCode ? node.text : escapeMarkdown(node.text), node.marks);
    })
    .join("");
}

function prefixLines(text: string, prefix: string): string {
  return text
    .split("\n")
    .map((line) => (line ? `${prefix}${line}` : prefix.trimEnd()))
    .join("\n");
}

/** Marker on the first line, matching indentation on any continuation lines. */
function listItemToMarkdown(item: JSONContent, marker: string): string {
  const [first = "", ...rest] = childrenToMarkdown(item.content).split("\n");
  const indent = " ".repeat(marker.length);
  return [marker + first, ...rest.map((line) => (line ? indent + line : ""))].join("\n");
}

function nodeToMarkdown(node: JSONContent): string {
  switch (node.type) {
    case "heading": {
      const level = Number(node.attrs?.level) || 1;
      return `${"#".repeat(Math.min(6, Math.max(1, level)))} ${inlineToMarkdown(node.content)}`;
    }
    case "paragraph":
      return inlineToMarkdown(node.content);
    case "blockquote":
      return prefixLines(childrenToMarkdown(node.content), "> ");
    case "codeBlock": {
      const lang = typeof node.attrs?.language === "string" ? node.attrs.language : "";
      const body = (node.content ?? [])
        .map((child) => (typeof child.text === "string" ? child.text : ""))
        .join("");
      return `\`\`\`${lang}\n${body}\n\`\`\``;
    }
    case "horizontalRule":
      return "---";
    case "bulletList":
      return (node.content ?? [])
        .map((item) => listItemToMarkdown(item, "- "))
        .join("\n");
    case "orderedList": {
      const start = Number(node.attrs?.start) || 1;
      return (node.content ?? [])
        .map((item, i) => listItemToMarkdown(item, `${start + i}. `))
        .join("\n");
    }
    default:
      return childrenToMarkdown(node.content) || inlineToMarkdown(node.content);
  }
}

function childrenToMarkdown(nodes: JSONContent[] | undefined): string {
  if (!nodes) return "";
  return nodes
    .map(nodeToMarkdown)
    .filter((chunk) => chunk.length > 0)
    .join("\n\n");
}

/**
 * Serialize a Tiptap document back to markdown. Normalized on the way out so
 * that an unchanged document always hashes to the same `body_hash` and does
 * not spuriously mark downstream activities stale.
 */
export function docToMarkdown(doc: JSONContent): string {
  return normalizeMarkdown(childrenToMarkdown(doc.content));
}
