import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { listSourceExtracts, listExtracts } from "./extracts";
import { memory, resetMemory } from "./memory";
import { getNotebook, listNotebookItems, listNotebooks } from "./notebooks";
import { getSource, listSources } from "./sources";
import {
  emptyTrash,
  listTrash,
  purgeExpired,
  purgeItem,
  restoreItem,
  trashItem,
} from "./trash";

afterEach(() => resetMemory());

function sourceWithExtracts() {
  const source = memory().sources.find((candidate) =>
    memory().extracts.some((extract) => extract.source_id === candidate.id),
  );
  assert.ok(source, "seed has a source with extracts");
  return source;
}

describe("recently deleted", () => {
  it("hides a trashed notebook and brings it back untouched", async () => {
    const [notebook] = await listNotebooks();
    const items = await listNotebookItems(notebook.id);

    assert.equal(await trashItem("notebook", notebook.id), true);
    assert.equal(await getNotebook(notebook.id), null);
    assert.ok(!(await listNotebooks()).some((n) => n.id === notebook.id));
    assert.equal((await listTrash()).length, 1);

    assert.equal(await restoreItem("notebook", notebook.id), true);
    assert.equal((await getNotebook(notebook.id))?.name, notebook.name);
    assert.equal((await listNotebookItems(notebook.id)).length, items.length);
    assert.equal((await listTrash()).length, 0);
  });

  it("takes a source's extracts and cards with it, and returns exactly those", async () => {
    const source = sourceWithExtracts();
    const before = await listSourceExtracts(source.id);
    const extractCountBefore = (await listExtracts()).length;

    await trashItem("source", source.id);
    assert.equal(await getSource(source.id), null);
    assert.equal((await listSourceExtracts(source.id)).length, 0);
    assert.equal(
      (await listExtracts()).length,
      extractCountBefore - before.length,
    );

    // Only the source is listed: its extracts ride along.
    const listed = await listTrash();
    assert.deepEqual(
      listed.map((entry) => entry.type),
      ["source"],
    );

    await restoreItem("source", source.id);
    assert.equal((await listSourceExtracts(source.id)).length, before.length);
    assert.equal((await listExtracts()).length, extractCountBefore);
  });

  it("does not resurrect an extract that was deleted on its own first", async () => {
    const source = sourceWithExtracts();
    const [first] = await listSourceExtracts(source.id);
    const total = (await listSourceExtracts(source.id)).length;

    await trashItem("extract", first.id);
    await trashItem("source", source.id);
    await restoreItem("source", source.id);

    assert.equal((await listSourceExtracts(source.id)).length, total - 1);
    assert.deepEqual(
      (await listTrash()).map((entry) => `${entry.type}:${entry.row.id}`),
      [`extract:${first.id}`],
    );
  });

  it("refuses to trash twice or restore something that is not deleted", async () => {
    const [notebook] = await listNotebooks();
    assert.equal(await restoreItem("notebook", notebook.id), false);
    assert.equal(await trashItem("notebook", notebook.id), true);
    assert.equal(await trashItem("notebook", notebook.id), false);
  });

  it("deletes forever only what is already in the trash", async () => {
    const [notebook] = await listNotebooks();
    assert.equal(await purgeItem("notebook", notebook.id), false);

    await trashItem("notebook", notebook.id);
    assert.equal(await purgeItem("notebook", notebook.id), true);
    assert.equal(await restoreItem("notebook", notebook.id), false);
    assert.ok(!memory().notebooks.some((n) => n.id === notebook.id));
    assert.ok(!memory().notebookItems.some((i) => i.notebook_id === notebook.id));
  });

  it("purges a source's dependents and its notebook memberships", async () => {
    const source = sourceWithExtracts();
    await trashItem("source", source.id);
    await purgeItem("source", source.id);

    assert.ok(!memory().extracts.some((extract) => extract.source_id === source.id));
    assert.ok(!memory().notebookItems.some((item) => item.item_id === source.id));
    assert.ok(!(await listSources()).some((s) => s.id === source.id));
  });

  it("expires after thirty days and empties on request", async () => {
    const [first, second] = await listNotebooks();
    await trashItem("notebook", first.id);
    await trashItem("notebook", second.id);

    memory().notebooks.find((n) => n.id === first.id)!.deleted_at = new Date(
      Date.now() - 31 * 24 * 60 * 60 * 1000,
    ).toISOString();

    assert.equal(await purgeExpired(), 1);
    assert.equal((await listTrash()).length, 1);
    assert.equal(await emptyTrash(), 1);
    assert.equal((await listTrash()).length, 0);
  });
});
