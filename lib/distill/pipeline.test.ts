import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { buildSelector } from "@/lib/anchor/selector";
import { normalizeMarkdown } from "@/lib/contracts/markdown";
import { dueQueue } from "@/lib/fsrs/queue";
import { getDraft } from "@/lib/store/distill";
import { createExtract, listReadingQueue, listSourceExtractsAny } from "@/lib/store/extracts";
import { memory, resetMemory } from "@/lib/store/memory";
import { listExtractNotes } from "@/lib/store/notes";
import { createSource, updateSource } from "@/lib/store/sources";
import { DraftNotReadyError, advanceDraft, approveDraft, distillExtracts } from "./pipeline";

// AI_MOCK defaults on, so every model call below is a fixture or a heuristic.

const MARKDOWN = normalizeMarkdown(`# Spacing effect

The spacing effect is the finding that long-term retention improves when study sessions are spread out over time rather than massed together.

Ebbinghaus reported in 1885 that forgetting follows a steep curve, with most of the loss happening within the first 24 hours after learning.

A review scheduled just before the memory would have faded strengthens it far more than a review made while the memory is still fresh.

Interleaving different topics within one session produces a similar benefit, because each switch forces the learner to retrieve rather than recognise.
`);

let sourceId: string;

beforeEach(async () => {
  const source = await createSource({
    kind: "url",
    title: "Spacing effect",
    origin_uri: "https://example.test/spacing",
  });
  await updateSource(source.id, { markdown: MARKDOWN, ingest_status: "ready" });
  sourceId = source.id;
});

afterEach(() => resetMemory());

describe("auto-distill pipeline", () => {
  it("proposes pending extracts that anchor verbatim, and is idempotent", async () => {
    const source = await distillExtracts(sourceId);
    assert.equal(source?.distill_status, "proposed");

    const proposed = await listSourceExtractsAny(sourceId);
    assert.ok(proposed.length > 0);
    for (const extract of proposed) {
      assert.equal(extract.accepted, false);
      assert.equal(MARKDOWN.slice(extract.selector.start, extract.selector.end), extract.body_md);
      assert.equal((await getDraft(extract.id))?.status, "pending");
    }

    await distillExtracts(sourceId, { force: true });
    assert.equal((await listSourceExtractsAny(sourceId)).length, proposed.length);
  });

  it("does not re-propose a passage the reader dismissed", async () => {
    await distillExtracts(sourceId);
    const [first] = await listSourceExtractsAny(sourceId);
    first.queue_status = "dismissed";
    await distillExtracts(sourceId, { force: true });
    const bodies = (await listSourceExtractsAny(sourceId)).map((e) => e.body_md);
    assert.equal(bodies.filter((body) => body === first.body_md).length, 1);
  });

  it("drafts one stage per call and puts nothing in review before approval", async () => {
    const reviewBefore = (await dueQueue()).length;
    const activitiesBefore = memory().activities.length;

    await distillExtracts(sourceId);
    const [extract] = await listReadingQueue(new Date(), { includePending: true });
    assert.equal((await advanceDraft(extract.id))?.status, "note_ready");
    const ready = await advanceDraft(extract.id);
    assert.equal(ready?.status, "ready");
    assert.ok(ready!.note_body_md);
    assert.ok(ready!.activities.length > 0);

    assert.equal(memory().activities.length, activitiesBefore);
    assert.equal((await dueQueue()).length, reviewBefore);
  });

  it("turns an approved draft into a note, a link, and reviewable cards", async () => {
    await distillExtracts(sourceId);
    const [extract] = await listReadingQueue(new Date(), { includePending: true });
    await advanceDraft(extract.id);
    const draft = (await advanceDraft(extract.id))!;
    const reviewBefore = (await dueQueue()).length;

    const result = await approveDraft(extract.id, {
      title: draft.note_title!,
      body_md: `${draft.note_body_md!}\n\nIn my own words.`,
      activities: draft.activities.slice(0, 2),
    });

    assert.equal(result?.note.origin, "ai_edited");
    assert.equal(result?.activities.length, 2);
    assert.equal(result?.activities[0].source_body_hash, result?.note.body_hash);
    assert.deepEqual(await listExtractNotes([extract.id]), [
      { extract_id: extract.id, note_id: result!.note.id },
    ]);
    assert.equal((await dueQueue()).length, reviewBefore + 2);

    const after = (await listSourceExtractsAny(sourceId)).find(({ id }) => id === extract.id)!;
    assert.equal(after.accepted, true);
    assert.equal(after.queue_status, "distilled");
    assert.equal((await getDraft(extract.id))?.status, "approved");
    await assert.rejects(
      approveDraft(extract.id, { title: "x", body_md: "y", activities: [] }),
      DraftNotReadyError,
    );
  });

  it("hands the draft to a hand-made twin instead of tripping the unique index", async () => {
    await distillExtracts(sourceId);
    const [pending] = await listReadingQueue(new Date(), { includePending: true });
    const { extract: twin } = await createExtract({
      source_id: sourceId,
      body_md: pending.body_md,
      priority: 50,
      selector: buildSelector(MARKDOWN, pending.selector.start, pending.selector.end),
      suggested_by: "human",
    });
    await advanceDraft(pending.id);
    const draft = (await advanceDraft(pending.id))!;

    const result = await approveDraft(pending.id, {
      title: draft.note_title!,
      body_md: draft.note_body_md!,
      activities: [],
    });

    assert.equal(result?.extract_id, twin.id);
    assert.equal(result?.note.origin, "ai_drafted");
    const all = await listSourceExtractsAny(sourceId);
    assert.equal(all.find(({ id }) => id === pending.id)?.queue_status, "dismissed");
    assert.equal(all.find(({ id }) => id === twin.id)?.queue_status, "distilled");
    assert.equal(all.filter((e) => e.accepted && e.body_md === pending.body_md).length, 1);
  });
});
