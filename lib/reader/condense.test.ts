import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseBlocks } from "@/lib/editor/blocks";
import { condense, type CondensedItem } from "./condense";

const MARKDOWN = [
  "# Title",
  "",
  "Intro paragraph that says little.",
  "",
  "More preamble nobody needs.",
  "",
  "## Section",
  "",
  "Filler before the point.",
  "",
  "The key passage starts here.",
  "",
  "And it continues into this block.",
  "",
  "Closing remarks.",
  "",
].join("\n");

const blocks = parseBlocks(MARKDOWN);

function rangeOf(text: string) {
  const start = MARKDOWN.indexOf(text);
  return { start, end: start + text.length };
}

function shape(items: CondensedItem[]): string[] {
  return items.map((item) =>
    item.kind === "gap"
      ? `gap:${item.blocks.length}`
      : MARKDOWN.slice(item.block.start, item.block.end),
  );
}

describe("condense", () => {
  it("keeps the passage and its nearest heading, folding the rest", () => {
    const items = condense(blocks, [rangeOf("The key passage starts here.")]);
    assert.deepEqual(shape(items), [
      "gap:3",
      "## Section",
      "gap:1",
      "The key passage starts here.",
      "gap:2",
    ]);
  });

  it("keeps every block an extract spans", () => {
    const start = MARKDOWN.indexOf("key passage");
    const end = MARKDOWN.indexOf("continues") + "continues".length;
    const kept = shape(condense(blocks, [{ start, end }]));
    assert.ok(kept.includes("The key passage starts here."));
    assert.ok(kept.includes("And it continues into this block."));
  });

  it("counts the words a gap hides", () => {
    const [gap] = condense(blocks, [rangeOf("The key passage starts here.")]);
    assert.equal(gap.kind, "gap");
    // "Title" + 5 + 4
    assert.equal(gap.kind === "gap" && gap.words, 10);
  });

  it("dissolves an expanded gap back into blocks without moving offsets", () => {
    const keep = [rangeOf("The key passage starts here.")];
    const [gap] = condense(blocks, keep);
    const opened = condense(blocks, keep, new Set([gap.kind === "gap" ? gap.start : -1]));
    assert.deepEqual(shape(opened).slice(0, 3), [
      "# Title",
      "Intro paragraph that says little.",
      "More preamble nobody needs.",
    ]);
    const all = opened.flatMap((item) => (item.kind === "gap" ? item.blocks : [item.block]));
    assert.deepEqual(all, blocks);
  });

  it("folds everything when nothing is kept", () => {
    assert.deepEqual(shape(condense(blocks, [])), [`gap:${blocks.length}`]);
  });
});
