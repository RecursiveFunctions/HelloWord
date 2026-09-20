import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseJsonLoose } from "./json";

describe("parseJsonLoose", () => {
  it("parses fenced JSON", () => {
    assert.deepEqual(parseJsonLoose('```json\n{"proposals":[]}\n```'), {
      ok: true,
      value: { proposals: [] },
    });
  });

  it("parses JSON following a reasoning trace", () => {
    assert.deepEqual(
      parseJsonLoose('<think>select passages</think>\n{"proposals":[]}'),
      { ok: true, value: { proposals: [] } },
    );
  });

  it("rejects malformed incomplete JSON", () => {
    const result = parseJsonLoose('{"proposals":[{"reason":"unfinished}');

    assert.equal(result.ok, false);
  });
});