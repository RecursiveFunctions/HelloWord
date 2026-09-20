import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { applyReadingAction } from "@/lib/reading/queue";
import { listReadingQueue, listSourceExtracts, readingCounts } from "./extracts";
import { memory, resetMemory } from "./memory";

// Every seed extract already fed a note, so the seeded queue is empty. Put
// three back, leaving the rest distilled.
beforeEach(() => {
  for (const extract of memory().extracts.slice(0, 3)) {
    extract.queue_status = "queued";
  }
});
afterEach(() => resetMemory());

const NOW = new Date();

describe("reading queue", () => {
  it("serves due passages by priority and leaves distilled ones out", async () => {
    const queue = await listReadingQueue(NOW);
    assert.ok(queue.length > 0);
    assert.ok(queue.every((extract) => extract.queue_status === "queued"));
    const priorities = queue.map((extract) => extract.priority);
    assert.deepEqual(priorities, [...priorities].sort((a, b) => a - b));
    assert.ok(queue.length < memory().extracts.length);
  });

  it("takes a read passage out of due and brings it back later", async () => {
    const [first] = await listReadingQueue(NOW);
    const updated = await applyReadingAction(first.id, { action: "next" });
    assert.equal(updated?.queue_reps, 1);
    assert.ok(Date.parse(updated!.queue_due) > Date.now());

    const after = await listReadingQueue(new Date());
    assert.ok(!after.some(({ id }) => id === first.id));
    const counts = await readingCounts(new Date());
    assert.equal(counts.queued - counts.due, 1);
  });

  it("never serves a dismissed passage again", async () => {
    const [first] = await listReadingQueue(NOW);
    await applyReadingAction(first.id, { action: "dismiss" });
    const farFuture = new Date(Date.now() + 400 * 86_400_000);
    assert.ok(!(await listReadingQueue(farFuture)).some(({ id }) => id === first.id));
  });

  it("hides unaccepted proposals unless asked, and retires one whose twin exists", async () => {
    const [twin] = await listSourceExtracts(memory().extracts[0].source_id!);
    const pending = {
      ...twin,
      id: crypto.randomUUID(),
      accepted: false,
      queue_status: "queued" as const,
      queue_due: new Date(0).toISOString(),
    };
    memory().extracts.push(pending);

    assert.ok(!(await listReadingQueue(NOW)).some(({ id }) => id === pending.id));
    assert.ok(
      (await listReadingQueue(NOW, { includePending: true })).some(({ id }) => id === pending.id),
    );

    const survivor = await applyReadingAction(pending.id, { action: "next" });
    assert.equal(survivor?.id, twin.id);
    assert.equal(memory().extracts.find(({ id }) => id === pending.id)?.queue_status, "dismissed");
  });
});
