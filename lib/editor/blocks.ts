/**
 * Offset-preserving markdown block parser for the reader's source pane.
 *
 * Highlights are painted with the CSS Custom Highlight API, which needs a DOM
 * `Range`, but extracts store character offsets into the normalized markdown.
 * This parser is the bridge: it splits markdown into block elements while
 * recording, for every run of rendered text, the source range it came from.
 *
 * The invariant is one-directional and deliberate:
 *
 *   Every DOM text node maps to a contiguous source range, but not every
 *   source character reaches the DOM.
 *
 * Markers (`# `, `- `, `> `, code fences) are dropped from the rendered output
 * while the text after them keeps its true offset. Inline syntax is *not*
 * parsed, so the characters inside a span are verbatim and offsets inside a
 * span need no mapping table. That is what keeps anchoring exact; parsing
 * inline emphasis here would mean threading an offset map through every
 * nested element for no reading benefit.
 */

/** Attribute carrying a span's source start offset into the DOM. */
export const MD_OFFSET_ATTR = "data-md-start";

/** A run of text rendered verbatim, tagged with where it came from. */
export type InlineSpan = { text: string; start: number; end: number };

export type Block =
  | { kind: "heading"; level: number; start: number; end: number; span: InlineSpan }
  | { kind: "paragraph"; start: number; end: number; lines: InlineSpan[] }
  | { kind: "blockquote"; start: number; end: number; lines: InlineSpan[] }
  | { kind: "list"; ordered: boolean; start: number; end: number; items: InlineSpan[] }
  | { kind: "code"; lang: string | null; start: number; end: number; lines: InlineSpan[] }
  | { kind: "hr"; start: number; end: number };

type Line = { text: string; start: number; end: number };

const HEADING = /^(#{1,6})[ \t]+(.*)$/;
const FENCE = /^```(\S*)$/;
const HR = /^(?:-{3,}|\*{3,}|_{3,})$/;
const BULLET = /^([ \t]*)([-*+])[ \t]+(.*)$/;
const ORDERED = /^([ \t]*)(\d+)[.)][ \t]+(.*)$/;
const QUOTE = /^>[ \t]?(.*)$/;

function toLines(markdown: string): Line[] {
  const lines: Line[] = [];
  let offset = 0;
  for (const text of markdown.split("\n")) {
    lines.push({ text, start: offset, end: offset + text.length });
    offset += text.length + 1; // the newline we split on
  }
  return lines;
}

/** Span covering the tail of a line, skipping `markerLength` leading characters. */
function tail(line: Line, markerLength: number): InlineSpan {
  const start = line.start + markerLength;
  return { text: line.text.slice(markerLength), start, end: line.end };
}

function isBlank(line: Line): boolean {
  return line.text.trim().length === 0;
}

function startsNewBlock(line: Line): boolean {
  return (
    isBlank(line) ||
    HEADING.test(line.text) ||
    FENCE.test(line.text) ||
    HR.test(line.text) ||
    BULLET.test(line.text) ||
    ORDERED.test(line.text) ||
    QUOTE.test(line.text)
  );
}

/**
 * Parse normalized markdown into blocks. Never throws: anything unrecognized
 * falls through to a paragraph, because a reader that refuses to render is
 * worse than one that renders plainly.
 */
export function parseBlocks(markdown: string): Block[] {
  const lines = toLines(markdown);
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    const heading = HEADING.exec(line.text);
    if (heading) {
      blocks.push({
        kind: "heading",
        level: heading[1].length,
        start: line.start,
        end: line.end,
        span: tail(line, heading[0].length - heading[2].length),
      });
      i += 1;
      continue;
    }

    if (HR.test(line.text)) {
      blocks.push({ kind: "hr", start: line.start, end: line.end });
      i += 1;
      continue;
    }

    const fence = FENCE.exec(line.text);
    if (fence) {
      const body: InlineSpan[] = [];
      let j = i + 1;
      while (j < lines.length && !FENCE.test(lines[j].text)) {
        body.push(tail(lines[j], 0));
        j += 1;
      }
      const closing = j < lines.length ? lines[j] : lines[j - 1];
      blocks.push({
        kind: "code",
        lang: fence[1] || null,
        start: line.start,
        end: closing.end,
        lines: body,
      });
      i = j + 1;
      continue;
    }

    if (QUOTE.test(line.text)) {
      const body: InlineSpan[] = [];
      let j = i;
      while (j < lines.length) {
        const quoted = QUOTE.exec(lines[j].text);
        if (!quoted) break;
        body.push(tail(lines[j], lines[j].text.length - quoted[1].length));
        j += 1;
      }
      blocks.push({
        kind: "blockquote",
        start: line.start,
        end: lines[j - 1].end,
        lines: body,
      });
      i = j;
      continue;
    }

    const bullet = BULLET.exec(line.text);
    const ordered = ORDERED.exec(line.text);
    if (bullet || ordered) {
      const isOrdered = Boolean(ordered);
      const items: InlineSpan[] = [];
      let j = i;
      while (j < lines.length) {
        const match = isOrdered ? ORDERED.exec(lines[j].text) : BULLET.exec(lines[j].text);
        if (!match) break;
        items.push(tail(lines[j], match[0].length - match[3].length));
        j += 1;
      }
      blocks.push({
        kind: "list",
        ordered: isOrdered,
        start: line.start,
        end: lines[j - 1].end,
        items,
      });
      i = j;
      continue;
    }

    const body: InlineSpan[] = [tail(line, 0)];
    let j = i + 1;
    while (j < lines.length && !startsNewBlock(lines[j])) {
      body.push(tail(lines[j], 0));
      j += 1;
    }
    blocks.push({
      kind: "paragraph",
      start: line.start,
      end: lines[j - 1].end,
      lines: body,
    });
    i = j;
  }

  return blocks;
}

/** Every rendered span in a block, in document order. */
export function spansOf(block: Block): InlineSpan[] {
  switch (block.kind) {
    case "heading":
      return [block.span];
    case "paragraph":
    case "blockquote":
    case "code":
      return block.lines;
    case "list":
      return block.items;
    case "hr":
      return [];
  }
}

/** Every rendered span in the document, in document order. */
export function allSpans(blocks: Block[]): InlineSpan[] {
  return blocks.flatMap(spansOf);
}
