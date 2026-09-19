import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeMarkdown } from "../contracts/markdown";
import { sourceMarkdown } from "../seed/sources";
import { allSpans, parseBlocks } from "./blocks";

const SAMPLE = normalizeMarkdown(`# Title

An ordinary paragraph that should keep every character.

> A quoted line.
> And a second one.

- first item
- second item

1. ordered one
2. ordered two

\`\`\`ts
const x = 1;
\`\`\`

---

Trailing paragraph.
`);

/**
 * The one invariant the whole highlighting scheme rests on: a span's text is
 * exactly the source text at its recorded offsets. If this ever fails,
 * highlights land on the wrong words and nothing throws to tell you.
 */
function assertSpansAreVerbatim(markdown: string, label: string) {
  const spans = allSpans(parseBlocks(markdown));
  for (const span of spans) {
    assert.equal(
      markdown.slice(span.start, span.end),
      span.text,
      `${label}: span at ${span.start}..${span.end} does not match its source`,
    );
  }
  return spans;
}

describe("parseBlocks", () => {
  it("keeps every span verbatim against the sample document", () => {
    assertSpansAreVerbatim(SAMPLE, "sample");
  });

  it("keeps every span verbatim across all seeded sources", () => {
    for (const [name, markdown] of Object.entries(sourceMarkdown)) {
      assertSpansAreVerbatim(markdown, name);
    }
  });

  it("emits spans in ascending, non-overlapping document order", () => {
    const spans = allSpans(parseBlocks(SAMPLE));
    for (let i = 1; i < spans.length; i += 1) {
      assert.ok(
        spans[i].start >= spans[i - 1].end,
        `span ${i} starts at ${spans[i].start}, before previous end ${spans[i - 1].end}`,
      );
    }
  });

  it("recognizes each block kind", () => {
    const kinds = parseBlocks(SAMPLE).map((b) => b.kind);
    assert.deepEqual(kinds, [
      "heading",
      "paragraph",
      "blockquote",
      "list",
      "list",
      "code",
      "hr",
      "paragraph",
    ]);
  });

  it("strips markers from rendered text but not from the offsets", () => {
    const [heading] = parseBlocks(SAMPLE);
    assert.equal(heading.kind, "heading");
    if (heading.kind !== "heading") return;
    assert.equal(heading.level, 1);
    assert.equal(heading.span.text, "Title");
    assert.equal(SAMPLE.slice(heading.span.start, heading.span.end), "Title");
    assert.equal(heading.start, 0, "the block still covers the '# ' marker");
    assert.ok(heading.span.start > heading.start);
  });

  it("separates ordered from unordered lists", () => {
    const lists = parseBlocks(SAMPLE).filter((b) => b.kind === "list");
    assert.equal(lists.length, 2);
    assert.equal(lists[0].kind === "list" && lists[0].ordered, false);
    assert.equal(lists[1].kind === "list" && lists[1].ordered, true);
    assert.deepEqual(
      lists[0].kind === "list" ? lists[0].items.map((s) => s.text) : [],
      ["first item", "second item"],
    );
  });

  it("excludes fence lines from code content", () => {
    const code = parseBlocks(SAMPLE).find((b) => b.kind === "code");
    assert.ok(code && code.kind === "code");
    assert.equal(code.lang, "ts");
    assert.deepEqual(code.lines.map((s) => s.text), ["const x = 1;"]);
  });

  it("does not throw on empty or whitespace-only input", () => {
    assert.deepEqual(parseBlocks(""), []);
    assert.deepEqual(parseBlocks("\n\n\n"), []);
  });

  it("covers a seeded extract's range with spans so it can be painted", () => {
    const markdown = sourceMarkdown.queue;
    const quote =
      "Extracts are not notes. An extract is a span you might want to remember; a note is the sentence you would say if you had to explain it tomorrow.";
    const start = markdown.indexOf(quote);
    assert.notEqual(start, -1);
    const covering = allSpans(parseBlocks(markdown)).filter(
      (s) => s.end > start && s.start < start + quote.length,
    );
    assert.ok(covering.length > 0, "extract range must intersect at least one span");
  });
});
