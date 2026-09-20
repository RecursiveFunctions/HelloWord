/**
 * The Postgres half of the store, run against a real Postgres engine.
 *
 * Every store function has two bodies, and until this file only the in-memory
 * one was ever executed before a deploy: `npm run dev` and the rest of the
 * suite have no `DATABASE_URL`. That is how code shipped naming columns the
 * production database did not have. This test builds the schema the way a
 * deploy does - `db/schema.sql`, then `scripts/migrate.ts` - and drives the
 * real SQL, so a missing migration or a query Postgres rejects fails here.
 *
 * PGlite is Postgres compiled to WASM: real parser, planner, and types, no
 * server. It has no TimescaleDB or pgvector, so the bootstrap strips the
 * hypertable clause, the continuous aggregate, and the `embedding` columns.
 * Nothing in the store reads those.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { before, describe, it } from "node:test";
import { PGlite } from "@electric-sql/pglite";

const MIGRATIONS = resolve(process.cwd(), "db", "migrations");

function portableSchema(): string {
  return readFileSync(resolve(process.cwd(), "db", "schema.sql"), "utf8")
    .replace(/create extension[^;]*;/gi, "")
    .replace(/^\s*embedding\s+vector\(768\),?\s*$/gim, "")
    .replace(/\)\s*with\s*\(tsdb[\s\S]*?\);/i, ");")
    .replace(/create index[^;]*using diskann[^;]*;/gi, "")
    .replace(/create materialized view[\s\S]*$/i, "")
    // Dropping a table's last column leaves a comma dangling before `)`.
    .replace(/,(\s*\))/g, "$1");
}

const MARKDOWN = `# Spacing effect

The spacing effect is the finding that long-term retention improves when study sessions are spread out over time rather than massed together.

Ebbinghaus reported in 1885 that forgetting follows a steep curve, with most of the loss happening within the first 24 hours after learning.

A review scheduled just before the memory would have faded strengthens it far more than a review made while the memory is still fresh.

Interleaving different topics within one session produces a similar benefit, because each switch forces the learner to retrieve rather than recognise.
`;

let db: PGlite;
let sourceId: string;

/** `pg`'s surface, as far as the store and the migration runner use it. */
const client = {
  async query(text: string, params?: unknown[]) {
    if (!params || params.length === 0) {
      // Migration files hold several statements; only `exec` accepts that.
      const results = await db.exec(text);
      return { rows: results[results.length - 1]?.rows ?? [] };
    }
    return { rows: (await db.query(text, params)).rows };
  },
  release() {},
};

before(async () => {
  // Before the first import of `lib/db`, which reads it once at load.
  process.env.DATABASE_URL = "postgres://pglite/test";
  process.env.AI_MOCK = "1";

  db = new PGlite();
  await db.exec(portableSchema());

  const dbModule = await import("../db");
  assert.ok(dbModule.pool, "lib/db should have built a pool from DATABASE_URL");
  // The pool never connects: both of its doors now open onto PGlite.
  Object.assign(dbModule.pool, { query: client.query, connect: async () => client });
});

describe("postgres backend", () => {
  it("migrates a bootstrapped database, once, and every file is re-runnable", async () => {
    const { migrate, migrationFiles } = await import("../../scripts/migrate");
    const ran = await migrate(client as never, { dir: MIGRATIONS });
    assert.deepEqual(ran, migrationFiles(MIGRATIONS));
    assert.deepEqual(await migrate(client as never, { dir: MIGRATIONS }), []);

    // Production's first run meets migrations applied by hand and never
    // recorded, so it runs them a second time. That has to be harmless.
    for (const file of ran) await db.exec(readFileSync(resolve(MIGRATIONS, file), "utf8"));
  });

  it("refuses a database that was never bootstrapped", async () => {
    const { migrate } = await import("../../scripts/migrate");
    const empty = new PGlite();
    const bare = {
      query: async (text: string, params?: unknown[]) => ({
        rows: (await empty.query(text, params ?? [])).rows,
      }),
    };
    await assert.rejects(migrate(bare as never, { dir: MIGRATIONS }), /schema\.sql/);
  });

  it("reports a healthy schema, and names the migration a database is missing", async () => {
    const { schemaHealth, SCHEMA_SENTINELS } = await import("../db-schema");
    const { migrationFiles } = await import("../../scripts/migrate");
    assert.deepEqual(await schemaHealth(), { ok: true, missing: [] });
    // A migration without a sentinel is a migration /api/health cannot see.
    assert.deepEqual(
      SCHEMA_SENTINELS.map((sentinel) => sentinel.migration),
      migrationFiles(MIGRATIONS),
    );

    await db.exec(`alter table extract rename column queue_status to queue_status_gone`);
    try {
      assert.deepEqual(await schemaHealth(), { ok: false, missing: ["500_extract_queue.sql"] });
    } finally {
      await db.exec(`alter table extract rename column queue_status_gone to queue_status`);
    }
  });

  it("distills a source into pending proposals that fill the reading queue", async () => {
    const { normalizeMarkdown } = await import("../contracts/markdown");
    const { createSource, updateSource, listSources } = await import("./sources");
    const { distillExtracts } = await import("../distill/pipeline");
    const { listExtracts, listReadingQueue, readingCounts } = await import("./extracts");
    const { readingDueCount, readingSnapshot } = await import("../reading/queue");
    await db.exec(`insert into scheduler_profile (name) values ('Default')`);

    const source = await createSource({
      kind: "url",
      title: "Spacing effect",
      origin_uri: "https://example.test/spacing",
    });
    assert.equal(source.distill_status, "none");
    await updateSource(source.id, { markdown: normalizeMarkdown(MARKDOWN), ingest_status: "ready" });
    sourceId = source.id;

    const distilled = await distillExtracts(source.id);
    assert.equal(distilled?.distill_status, "proposed", distilled?.distill_error ?? undefined);
    assert.equal((await listSources()).length, 1);

    const soon = new Date(Date.now() + 1_000);
    const queue = await listReadingQueue(soon, { includePending: true, limit: 30 });
    assert.ok(queue.length > 0);
    assert.ok(queue.every((extract) => !extract.accepted));
    assert.deepEqual(await listReadingQueue(soon), []);
    assert.deepEqual(await listExtracts(), []);
    assert.deepEqual(await readingCounts(soon, { includePending: true }), {
      due: queue.length,
      queued: queue.length,
    });
    assert.equal(await readingDueCount(), queue.length);
    assert.equal((await readingSnapshot({ includePending: true })).items[0].source_title, "Spacing effect");
  });

  it("moves a passage through the queue", async () => {
    const { listReadingQueue } = await import("./extracts");
    const { applyReadingAction } = await import("../reading/queue");
    const [first] = await listReadingQueue(new Date(Date.now() + 1_000), { includePending: true });

    const kept = await applyReadingAction(first.id, { action: "next", priority: 20 });
    assert.equal(kept?.accepted, true);
    assert.equal(kept?.priority, 20);
    assert.equal(kept?.queue_reps, 1);
    assert.ok(Date.parse(kept!.queue_due) > Date.now());

    assert.equal((await applyReadingAction(first.id, { action: "dismiss" }))?.queue_status, "dismissed");
    assert.equal((await applyReadingAction(first.id, { action: "requeue" }))?.queue_status, "queued");
  });

  it("drafts in claimed stages and makes nothing reviewable until approval", async () => {
    const { listReadingQueue, getExtractAny } = await import("./extracts");
    const { claimDraft, listDrafts } = await import("./distill");
    const { advanceDraft, approveDraft } = await import("../distill/pipeline");
    const { listExtractNotes } = await import("./notes");
    const { dueQueue, dueCounts } = await import("../fsrs/queue");

    const pending = (await listReadingQueue(new Date(Date.now() + 1_000), { includePending: true }))
      .find((extract) => !extract.accepted)!;
    const reviewBefore = (await dueQueue()).length;

    assert.equal((await advanceDraft(pending.id))?.status, "note_ready");
    assert.equal(await claimDraft(pending.id, "pending", "drafting_note"), null);
    const ready = (await advanceDraft(pending.id))!;
    assert.equal(ready.status, "ready");
    assert.ok(ready.activities.length > 0);
    assert.equal((await listDrafts([pending.id])).length, 1);
    assert.equal((await dueQueue()).length, reviewBefore);

    const approved = await approveDraft(pending.id, {
      title: ready.note_title!,
      body_md: `${ready.note_body_md!}\n\nIn my own words.`,
      activities: ready.activities,
    });
    assert.equal(approved?.note.origin, "ai_edited");
    assert.equal((await dueQueue()).length, reviewBefore + ready.activities.length);
    assert.equal((await dueCounts()).total, reviewBefore + ready.activities.length);
    assert.deepEqual(await listExtractNotes([pending.id]), [
      { extract_id: pending.id, note_id: approved!.note.id },
    ]);
    assert.equal((await getExtractAny(pending.id))?.queue_status, "distilled");
  });

  it("reclaims a draft abandoned by a function that timed out", async () => {
    const { listSourceExtractsAny, deleteExtract } = await import("./extracts");
    const { getDraft, updateDraft } = await import("./distill");
    const { advanceDraft, retryDraft } = await import("../distill/pipeline");

    const spare = (await listSourceExtractsAny(sourceId)).find(
      (extract) => !extract.accepted && extract.queue_status === "queued",
    )!;
    await updateDraft(spare.id, { status: "failed", error: "boom" });
    assert.equal((await retryDraft(spare.id))?.status, "pending");

    await db.query(
      `update distill_draft set status = 'drafting_note', updated_at = now() - interval '5 minutes'
        where extract_id = $1`,
      [spare.id],
    );
    assert.equal((await advanceDraft(spare.id))?.status, "note_ready");

    await deleteExtract(spare.id);
    assert.equal(await getDraft(spare.id), null);
  });
});
