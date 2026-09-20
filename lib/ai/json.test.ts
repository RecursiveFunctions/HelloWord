import assert from "node:assert/strict";
import { test } from "node:test";
import { closeTruncatedJson, parseJsonLoose } from "./json";

/**
 * The failure these cover is the one users actually saw: Nemotron hit its
 * token ceiling partway through the proposals array, every parse failed, and
 * the repair round trip was cut off in the same place.
 */

const TRUNCATED_PROPOSALS = `{ "proposals": [ { "exact": "FSRS estimates retrievability from a memory model, not from an ease factor you twist by hand.", "priority": 8, "reason": "Highlights the core differ`;

test("salvages the finished elements of a cut-off array", () => {
  const result = parseJsonLoose(TRUNCATED_PROPOSALS);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, {
    proposals: [
      {
        exact:
          "FSRS estimates retrievability from a memory model, not from an ease factor you twist by hand.",
        priority: 8,
      },
    ],
  });
});

test("keeps every element completed before the cut", () => {
  const raw = `{"activities":[{"type":"mcq","answer":0},{"type":"closed","answer":"a"},{"type":"mcq","stem":"unfinis`;
  const result = parseJsonLoose(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, {
    activities: [
      { type: "mcq", answer: 0 },
      { type: "closed", answer: "a" },
    ],
  });
});

test("a brace inside a truncated string does not end the scan", () => {
  const raw = `{"proposals":[{"exact":"use {{1}} here","priority":5},{"exact":"a } brace and then`;
  const result = parseJsonLoose(raw);
  assert.equal(result.ok, true);
  assert.deepEqual(result.ok && result.value, {
    proposals: [{ exact: "use {{1}} here", priority: 5 }],
  });
});

test("leaves well formed JSON alone", () => {
  assert.equal(closeTruncatedJson('{"a":1,"b":2}'), null);
  const result = parseJsonLoose('```json\n{"a":1,"b":2}\n```');
  assert.deepEqual(result.ok && result.value, { a: 1, b: 2 });
});

test("does not invent a document when nothing finished", () => {
  assert.equal(closeTruncatedJson('{"proposals":['), null);
  assert.equal(closeTruncatedJson("no json at all"), null);
  assert.equal(parseJsonLoose('{"proposals":[').ok, false);
});

test("reasoning traces are still stripped before salvage", () => {
  const raw = `<think>The answer needs { and } characters.</think>{"proposals":[{"exact":"one","priority":1},{"exact":"tw`;
  const result = parseJsonLoose(raw);
  assert.deepEqual(result.ok && result.value, {
    proposals: [{ exact: "one", priority: 1 }],
  });
});
