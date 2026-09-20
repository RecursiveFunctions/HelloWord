import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applyHistory,
  HistoryLog,
  redoNext,
  undoNext,
  type HistoryAction,
  type Send,
} from "./history";

function recorder(ok = true) {
  const calls: string[] = [];
  const send: Send = async (url, init) => {
    calls.push(`${init.method} ${url}`);
    return ok;
  };
  return { calls, send };
}

let n = 0;
function add(log: HistoryLog, action: HistoryAction, label = "x") {
  return log.record({ id: `e${++n}`, at: n, label, action });
}

const trash = (id: string): HistoryAction => ({ kind: "trash", type: "note", id });
const unlink = (itemId: string): HistoryAction => ({
  kind: "unlink",
  notebookId: "nb",
  itemType: "source",
  itemId,
});

describe("history undo and redo", () => {
  it("undoes the newest action first, then walks back", async () => {
    const log = new HistoryLog();
    const first = add(log, trash("a"));
    const second = add(log, unlink("b"));
    const { send, calls } = recorder();

    assert.equal((await undoNext(log, send))?.id, second.id);
    assert.equal((await undoNext(log, send))?.id, first.id);
    assert.equal(await undoNext(log, send), null);
    assert.deepEqual(calls, [
      "POST /api/notebooks/nb/items",
      "POST /api/trash/note/a",
    ]);
  });

  it("redoes the most recently undone action, with the original request", async () => {
    const log = new HistoryLog();
    add(log, trash("a"));
    add(log, unlink("b"));
    const { send, calls } = recorder();

    await undoNext(log, send);
    await undoNext(log, send);
    calls.length = 0;

    await redoNext(log, send); // b was undone first, a last: a comes back first
    assert.deepEqual(calls, ["POST /api/trash"]);
    await redoNext(log, send);
    assert.deepEqual(calls.slice(1), [
      "DELETE /api/notebooks/nb/items?item_type=source&item_id=b",
    ]);
    assert.equal(await redoNext(log, send), null);
  });

  it("leaves the log alone when the request fails", async () => {
    const log = new HistoryLog();
    const entry = add(log, trash("a"));
    const { send } = recorder(false);

    assert.equal(await undoNext(log, send), null);
    assert.equal(log.entries().find((e) => e.id === entry.id)?.done, true);
  });

  it("lets the menu reverse any entry out of order, and refuses a double undo", async () => {
    const log = new HistoryLog();
    const older = add(log, unlink("a"));
    add(log, unlink("b"));
    const { send, calls } = recorder();

    assert.equal(await applyHistory(log, older, "undo", send), true);
    // `older` is stale now: the log has moved on, so a second undo is a no-op.
    assert.equal(await applyHistory(log, older, "undo", send), false);
    assert.equal(calls.length, 1);
    assert.equal(log.nextUndo()?.label, "x");
    assert.equal(log.nextRedo()?.id, older.id);
  });

  it("notifies subscribers and caps its length", () => {
    const log = new HistoryLog();
    let notified = 0;
    log.subscribe(() => (notified += 1));
    for (let i = 0; i < 60; i += 1) add(log, trash(String(i)));
    assert.equal(notified, 60);
    assert.equal(log.entries().length, 50);
  });
});
