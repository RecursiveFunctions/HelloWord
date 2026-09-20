import type { TrashType } from "@/lib/store/trash";

/**
 * The session's record of deletes and removals, newest last.
 *
 * Each entry describes one reversible action as data, so it survives
 * navigation and a reload (see `lib/client/trash.ts`, which persists it) and
 * can be undone from the History menu long after its toast is gone.
 *
 * Undo and redo are per entry, not a strict stack: Cmd+Z takes back the newest
 * action still in effect, Cmd+Shift+Z re-applies whichever was undone last, and
 * the menu can reverse any single entry regardless of order.
 */

export type HistoryAction =
  | { kind: "trash"; type: TrashType; id: string }
  | { kind: "unlink"; notebookId: string; itemType: string; itemId: string };

export type HistoryEntry = {
  id: string;
  at: number;
  /** What was touched, e.g. the item's title. */
  label: string;
  /** Where it happened, e.g. the notebook it was removed from. */
  where?: string;
  action: HistoryAction;
  /** True while the action is in effect, false once it has been undone. */
  done: boolean;
  /** Sequence number of the undo, so redo can pick the latest. */
  undoneAt?: number;
};

const MAX_ENTRIES = 50;

export class HistoryLog {
  private items: HistoryEntry[] = [];
  private listeners = new Set<() => void>();
  /** Orders undos without trusting the clock, which can repeat within a ms. */
  private seq = 0;

  constructor(initial: HistoryEntry[] = []) {
    this.items = initial.slice(-MAX_ENTRIES);
    this.seq = Math.max(0, ...this.items.map((entry) => entry.undoneAt ?? 0));
  }

  /** Stable between changes, so it can back `useSyncExternalStore`. */
  entries = (): readonly HistoryEntry[] => this.items;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private change(next: HistoryEntry[]) {
    this.items = next;
    this.listeners.forEach((listener) => listener());
  }

  record(entry: Omit<HistoryEntry, "done" | "undoneAt">): HistoryEntry {
    const created: HistoryEntry = { ...entry, done: true };
    this.change([...this.items, created].slice(-MAX_ENTRIES));
    return created;
  }

  /** Newest action still in effect: what Cmd+Z reverses. */
  nextUndo(): HistoryEntry | undefined {
    return [...this.items].reverse().find((entry) => entry.done);
  }

  /** Most recently undone action: what Cmd+Shift+Z re-applies. */
  nextRedo(): HistoryEntry | undefined {
    return this.items
      .filter((entry) => !entry.done)
      .sort((a, b) => (b.undoneAt ?? 0) - (a.undoneAt ?? 0))[0];
  }

  setDone(id: string, done: boolean) {
    const undoneAt = done ? undefined : ++this.seq;
    this.change(
      this.items.map((entry) =>
        entry.id === id
          ? { ...entry, done, undoneAt }
          : entry,
      ),
    );
  }

  clear() {
    this.change([]);
  }
}

export type Send = (url: string, init: RequestInit) => Promise<boolean>;

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

/** Reverse or re-apply one entry over HTTP, and record the result if it took. */
export async function applyHistory(
  log: HistoryLog,
  entry: HistoryEntry,
  direction: "undo" | "redo",
  send: Send,
): Promise<boolean> {
  const undo = direction === "undo";
  // The caller's copy may be stale; the log is the truth about what is in effect.
  const current = log.entries().find(({ id }) => id === entry.id);
  if (!current || undo !== current.done) return false;
  const { action } = entry;

  let ok: boolean;
  if (action.kind === "trash") {
    ok = undo
      ? await send(`/api/trash/${action.type}/${action.id}`, { method: "POST" })
      : await send("/api/trash", post({ type: action.type, id: action.id }));
  } else {
    const url = `/api/notebooks/${action.notebookId}/items`;
    const item = { item_type: action.itemType, item_id: action.itemId };
    ok = undo
      ? await send(url, post(item))
      : await send(`${url}?${new URLSearchParams(item)}`, { method: "DELETE" });
  }

  if (ok) log.setDone(entry.id, !undo);
  return ok;
}

/** Cmd+Z. Resolves to the entry that was reversed, or null if nothing was. */
export async function undoNext(
  log: HistoryLog,
  send: Send,
): Promise<HistoryEntry | null> {
  const entry = log.nextUndo();
  return entry && (await applyHistory(log, entry, "undo", send)) ? entry : null;
}

/** Cmd+Shift+Z. Resolves to the entry that was re-applied, or null. */
export async function redoNext(
  log: HistoryLog,
  send: Send,
): Promise<HistoryEntry | null> {
  const entry = log.nextRedo();
  return entry && (await applyHistory(log, entry, "redo", send)) ? entry : null;
}
