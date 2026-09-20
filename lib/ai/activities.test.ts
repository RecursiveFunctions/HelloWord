import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeActivityBatch } from "./activities";

describe("normalizeActivityBatch", () => {
  it("wraps a provider's bare activity array", () => {
    const activities = [{ type: "closed", stem: "Why?", answer: "Because" }];

    assert.deepEqual(normalizeActivityBatch(activities), { activities });
  });

  it("preserves the requested object shape", () => {
    const batch = {
      activities: [{ type: "closed", stem: "Why?", answer: "Because" }],
    };

    assert.equal(normalizeActivityBatch(batch), batch);
  });
});