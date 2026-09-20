import { toast } from "@/components/ui/toast";
import type { TrashType } from "@/lib/store/trash";
import {
  applyHistory,
  HistoryLog,
  redoNext,
  undoNext,
  type HistoryAction,
  type HistoryEntry,
  type Send,
} from "./history";

/**
 * Browser side of Recently deleted. Every destructive click goes through here,
 * so it is logged (see `history.ts`), answered with an Undo toast, and reachable
 * later from the History menu. The log lives in sessionStorage, so it survives
 * navigating between screens and reloading the tab.
 */

export type TrashRef = { type: TrashType; id: string };

const UNDO_TOAST_MS = 15000;
const STORAGE_KEY = "helloword:history";

function load(): HistoryEntry[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
  } catch {
    return [];
  }
}

let log: HistoryLog | null = null;

/** Created on first use in the browser, hydrated from sessionStorage. */
export function historyLog(): HistoryLog {
  if (!log) {
    log = new HistoryLog(typeof window === "undefined" ? [] : load());
    log.subscribe(() => {
      try {
        window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(log!.entries()));
      } catch {
        // Private windows and blocked storage just lose persistence.
      }
    });
  }
  return log;
}

/** Server snapshot for `useSyncExternalStore`: nothing has happened yet. */
export const NO_HISTORY: readonly HistoryEntry[] = [];

const send: Send = async (url, init) => {
  try {
    return (await fetch(url, init)).ok;
  } catch {
    return false;
  }
};

const appliedListeners = new Set<() => void>();

/** Fires after any change made through history, so the page can re-render. */
export function onHistoryApplied(listener: () => void): () => void {
  appliedListeners.add(listener);
  return () => appliedListeners.delete(listener);
}

function applied() {
  appliedListeners.forEach((listener) => listener());
}

function failed(message: string) {
  toast.add({ title: message, type: "error" });
}

function describe(entry: HistoryEntry): string {
  return `“${entry.label}”`;
}

export async function undoLast(): Promise<boolean> {
  const entry = await undoNext(historyLog(), send);
  if (!entry) return false;
  applied();
  toast.add({ title: `Undid ${describe(entry)}`, timeout: 4000 });
  return true;
}

export async function redoLast(): Promise<boolean> {
  const entry = await redoNext(historyLog(), send);
  if (!entry) return false;
  applied();
  toast.add({ title: `Redid ${describe(entry)}`, timeout: 4000 });
  return true;
}

/** From the History menu: reverse or re-apply one specific entry. */
export async function applyEntry(
  entry: HistoryEntry,
  direction: "undo" | "redo",
): Promise<void> {
  const ok = await applyHistory(historyLog(), entry, direction, send);
  if (!ok) return failed(`Could not ${direction} ${describe(entry)}.`);
  applied();
}

function record(
  action: HistoryAction,
  label: string,
  where: string | undefined,
  title: string,
  description: string,
) {
  const entry = historyLog().record({
    id: crypto.randomUUID(),
    at: Date.now(),
    label,
    where,
    action,
  });
  toast.add({
    title,
    description,
    timeout: UNDO_TOAST_MS,
    actionProps: {
      children: "Undo",
      onClick: () => void applyEntry(entry, "undo"),
    },
  });
}

export function restoreFromTrash({ type, id }: TrashRef): Promise<boolean> {
  return send(`/api/trash/${type}/${id}`, { method: "POST" });
}

/** Move to Recently deleted, then refresh the page. */
export async function trashWithUndo(
  ref: TrashRef,
  label: string,
  refresh: () => void,
): Promise<void> {
  const ok = await send("/api/trash", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ref),
  });
  if (!ok) return failed(`Could not delete “${label}”.`);

  refresh();
  record(
    { kind: "trash", ...ref },
    label,
    undefined,
    `Deleted “${label}”`,
    "Kept in Recently deleted for 30 days. Find it under History.",
  );
}

/** Drop a notebook's link to an item. The item itself stays in the Library. */
export async function removeFromNotebookWithUndo(
  notebook: { id: string; name: string },
  item: { type: string; id: string },
  label: string,
  refresh: () => void,
): Promise<void> {
  const params = new URLSearchParams({ item_type: item.type, item_id: item.id });
  const ok = await send(`/api/notebooks/${notebook.id}/items?${params}`, {
    method: "DELETE",
  });
  if (!ok) return failed(`Could not remove “${label}”.`);

  refresh();
  record(
    {
      kind: "unlink",
      notebookId: notebook.id,
      itemType: item.type,
      itemId: item.id,
    },
    label,
    notebook.name,
    `Removed “${label}” from ${notebook.name}`,
    "Still in your Library. Put it back from History.",
  );
}
