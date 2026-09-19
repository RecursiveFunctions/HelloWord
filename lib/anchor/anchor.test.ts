import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SelectorBundle } from "../contracts/anchor";
import { sourceMarkdown } from "../seed/sources";
import { buildSelector, isAnchorableRange, resolveExact } from "./selector";
import { reanchor } from "./reanchor";

const md = sourceMarkdown.queue;
const QUOTE =
  "A reading pile is a graveyard. A reading queue is a promise that the next thing you see is the most important unread span you have.";

function selectorForQuote(text: string, quote: string) {
  const start = text.indexOf(quote);
  assert.notEqual(start, -1, "fixture quote must exist in the fixture text");
  return buildSelector(text, start, start + quote.length);
}

describe("buildSelector", () => {
  it("produces a bundle that satisfies the frozen contract", () => {
    const selector = selectorForQuote(md, QUOTE);
    assert.doesNotThrow(() => SelectorBundle.parse(selector));
    assert.equal(selector.exact, QUOTE);
    assert.equal(md.slice(selector.start, selector.end), QUOTE);
  });

  it("orders and clamps a backwards or out-of-bounds range", () => {
    const text = "hello world";
    assert.deepEqual(buildSelector(text, 8, 2), buildSelector(text, 2, 8));
    assert.equal(buildSelector(text, -5, 999).exact, text);
  });

  it("gates ranges below the contract's ten-character floor", () => {
    assert.equal(isAnchorableRange(0, 9), false);
    assert.equal(isAnchorableRange(0, 10), true);
  });
});

describe("resolveExact", () => {
  it("resolves a bare quote, which is how AI proposals become bundles", () => {
    const selector = resolveExact(md, QUOTE);
    assert.ok(selector);
    assert.equal(md.slice(selector.start, selector.end), QUOTE);
  });

  it("returns null for a paraphrase rather than guessing", () => {
    assert.equal(resolveExact(md, "A reading pile is a cemetery."), null);
  });

  it("picks the occurrence nearest the hint when a quote repeats", () => {
    const text = `${"x".repeat(50)}repeated span${"y".repeat(200)}repeated span`;
    const near = resolveExact(text, "repeated span", 250);
    assert.equal(near?.start, text.lastIndexOf("repeated span"));
    assert.equal(resolveExact(text, "repeated span", 0)?.start, 50);
  });
});

describe("reanchor ladder", () => {
  it("rung 1: keeps stored offsets when the source has not moved", () => {
    const result = reanchor(md, selectorForQuote(md, QUOTE));
    assert.equal(result.strategy, "offset");
    assert.equal(result.status, "anchored");
    assert.equal(result.confidence, 1);
  });

  it("rung 2: finds the verbatim quote after text is inserted above it", () => {
    const stored = selectorForQuote(md, QUOTE);
    const shifted = `# Preamble\n\n${"Inserted paragraph. ".repeat(40)}\n\n${md}`;
    const result = reanchor(shifted, stored);
    assert.equal(result.strategy, "quote");
    assert.equal(shifted.slice(result.selector.start, result.selector.end), QUOTE);
  });

  it("rung 2: disambiguates a duplicated quote using stored context", () => {
    const stored = selectorForQuote(md, QUOTE);
    // The decoy copy has no surrounding context in common with the original.
    const duplicated = `${"z".repeat(80)}${QUOTE}${"z".repeat(80)}\n\n${md}`;
    const result = reanchor(duplicated, stored);
    assert.equal(result.strategy, "quote");
    assert.equal(result.selector.start, duplicated.indexOf(QUOTE, 200));
  });

  it("rung 3: recovers a rewritten span between intact prefix and suffix", () => {
    const stored = selectorForQuote(md, QUOTE);
    const rewritten = md.replace(
      QUOTE,
      "A reading pile is a graveyard, and a reading queue is a standing promise about what you see next.",
    );
    const result = reanchor(rewritten, stored);
    assert.equal(result.status, "anchored");
    assert.ok(
      result.strategy === "context" || result.strategy === "fuzzy",
      `expected context or fuzzy, got ${result.strategy}`,
    );
    assert.ok(result.selector.exact.includes("graveyard"));
  });

  it("rung 4: tolerates light copy-editing inside the quote", () => {
    const stored = selectorForQuote(md, QUOTE);
    const edited = md
      .replace(QUOTE, QUOTE.replace("graveyard", "graveyrad").replace("promise", "pledge"))
      // Remove the suffix too, so the context rung cannot claim the match.
      .replace("Priority is not importance", "Ranking is not importance");
    const result = reanchor(edited, stored);
    assert.equal(result.status, "anchored");
    assert.ok(result.confidence >= 0.7 && result.confidence < 1);
  });

  it("orphans rather than guessing when the passage is gone", () => {
    const stored = selectorForQuote(md, QUOTE);
    const result = reanchor(sourceMarkdown.fsrs, stored);
    assert.equal(result.status, "orphaned");
    assert.equal(result.strategy, "none");
    assert.deepEqual(result.selector, stored, "orphaning must preserve the stored text");
  });

  it("never throws on degenerate input", () => {
    const stored = selectorForQuote(md, QUOTE);
    assert.equal(reanchor("", stored).status, "orphaned");
    assert.equal(reanchor(md, { ...stored, exact: "" }).status, "orphaned");
  });

  it("re-anchors every seeded extract against its own source", async () => {
    const { extracts } = await import("../seed/data");
    const { sources } = await import("../seed/data");
    for (const extract of extracts) {
      const source = sources.find((s) => s.id === extract.source_id);
      assert.ok(source);
      const result = reanchor(source.markdown, extract.selector);
      assert.equal(result.strategy, "offset", `extract ${extract.id} drifted`);
    }
  });
});
