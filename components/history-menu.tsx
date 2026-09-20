"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { History, Redo2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverDescription,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  applyEntry,
  historyLog,
  NO_HISTORY,
  onHistoryApplied,
  redoLast,
  undoLast,
} from "@/lib/client/trash";
import type { HistoryEntry } from "@/lib/client/history";
import { cn } from "@/lib/utils";

function useHistory(): readonly HistoryEntry[] {
  return useSyncExternalStore(
    (listener) => historyLog().subscribe(listener),
    () => historyLog().entries(),
    () => NO_HISTORY,
  );
}

/**
 * Mounted once in the top bar, with no visible UI of its own. Owns Cmd/Ctrl+Z
 * and Cmd/Ctrl+Shift+Z (or Ctrl+Y) for the whole app, and re-renders the page
 * after any change made through history, wherever it was triggered from.
 */
export function HistoryShortcuts() {
  const router = useRouter();

  useEffect(() => onHistoryApplied(() => router.refresh()), [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const redo =
        (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
      const undo = key === "z" && !event.shiftKey;
      if (!undo && !redo) return;

      // Text fields keep the browser's own undo.
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          "input, textarea, select, [contenteditable]:not([contenteditable=false])",
        )
      ) {
        return;
      }

      const log = historyLog();
      if (!(redo ? log.nextRedo() : log.nextUndo())) return;
      event.preventDefault();
      void (redo ? redoLast() : undoLast());
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}

function status(entry: HistoryEntry): string {
  return entry.done ? "Removed" : "Put back";
}

/**
 * One notebook's history: everything removed from it this session, with a way
 * to put each item back. It lists only removals from *this* notebook; deletes
 * of the notebook or of Library items live in Recently deleted.
 */
export function NotebookHistory({
  notebookId,
  notebookName,
  className,
  alwaysVisible = true,
}: {
  notebookId: string;
  notebookName: string;
  className?: string;
  /** Cards hide the button until hover on mouse pointers, unless there is something to see. */
  alwaysVisible?: boolean;
}) {
  const all = useHistory();
  const entries = all.filter(
    (entry) =>
      entry.action.kind === "unlink" && entry.action.notebookId === notebookId,
  );
  const newestFirst = [...entries].reverse();
  const removed = entries.filter((entry) => entry.done);
  const lastUndone = entries
    .filter((entry) => !entry.done)
    .sort((a, b) => (b.undoneAt ?? 0) - (a.undoneAt ?? 0))[0];
  const newestDone = newestFirst.find((entry) => entry.done);

  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon-touch"
            aria-label={`History of ${notebookName}`}
            className={cn(
              "relative text-muted-foreground",
              !alwaysVisible &&
                removed.length === 0 &&
                "pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover/notebook:opacity-100 pointer-fine:focus-visible:opacity-100",
              className,
            )}
          />
        }
      >
        <History />
        {removed.length > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
            {removed.length}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-96 max-w-[calc(100vw-2rem)] gap-3 p-3"
      >
        <PopoverHeader>
          <PopoverTitle>{notebookName} history</PopoverTitle>
          <PopoverDescription>
            Items removed from this notebook in this browser tab. They are all
            still in your Library. Cmd/Ctrl+Z undoes the latest change,
            Cmd/Ctrl+Shift+Z redoes it.
          </PopoverDescription>
        </PopoverHeader>

        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={!newestDone}
            onClick={() => newestDone && void applyEntry(newestDone, "undo")}
          >
            <Undo2 /> Undo
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!lastUndone}
            onClick={() => lastUndone && void applyEntry(lastUndone, "redo")}
          >
            <Redo2 /> Redo
          </Button>
        </div>

        {newestFirst.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            Nothing removed yet.
          </p>
        ) : (
          <ul className="-mx-1 max-h-80 divide-y overflow-y-auto">
            {newestFirst.map((entry) => (
              <li key={entry.id} className="flex items-center gap-2 px-1 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{entry.label}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {status(entry)} ·{" "}
                    {new Date(entry.at).toLocaleTimeString([], {
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void applyEntry(entry, entry.done ? "undo" : "redo")
                  }
                >
                  {entry.done ? "Put back" : "Remove again"}
                </Button>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/library/trash"
          className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Open Recently deleted
        </Link>
      </PopoverContent>
    </Popover>
  );
}
