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

function useHistory(): readonly HistoryEntry[] {
  return useSyncExternalStore(
    (listener) => historyLog().subscribe(listener),
    () => historyLog().entries(),
    () => NO_HISTORY,
  );
}

function status(entry: HistoryEntry): string {
  const where = entry.where ? ` ${entry.where}` : "";
  if (entry.action.kind === "unlink") {
    return entry.done ? `Removed from${where}` : `Put back in${where}`;
  }
  return entry.done ? "Deleted" : "Restored";
}

/**
 * Mounted once in the top bar. Owns Cmd/Ctrl+Z and Cmd/Ctrl+Shift+Z for the
 * whole app, re-renders the page after any change made through history, and
 * lists this session's deletes and removals so they can be reversed after the
 * toast has gone, or after navigating away from the notebook they happened in.
 */
export function HistoryMenu() {
  const router = useRouter();
  const entries = useHistory();

  useEffect(() => onHistoryApplied(() => router.refresh()), [router]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      const redo = (key === "z" && event.shiftKey) || (key === "y" && !event.shiftKey);
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

  const newestFirst = [...entries].reverse();
  const log = historyLog();
  const active = entries.filter((entry) => entry.done).length;

  return (
    <div className="flex justify-end">
      <Popover>
        <PopoverTrigger
          render={
            <Button
              variant="ghost"
              size="icon-touch"
              aria-label="History of recent deletes and removals"
              className="relative text-muted-foreground"
            />
          }
        >
          <History />
          {active > 0 ? (
            <span className="absolute top-1.5 right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {active}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] gap-3 p-3">
          <PopoverHeader>
            <PopoverTitle>History</PopoverTitle>
            <PopoverDescription>
              Recent deletes and removals from this session. Cmd/Ctrl+Z undoes
              the latest, Cmd/Ctrl+Shift+Z redoes it.
            </PopoverDescription>
          </PopoverHeader>

          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={!log.nextUndo()}
              onClick={() => void undoLast()}
            >
              <Undo2 /> Undo
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={!log.nextRedo()}
              onClick={() => void redoLast()}
            >
              <Redo2 /> Redo
            </Button>
          </div>

          {newestFirst.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">
              Nothing yet. Deletes and removals will show up here.
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
                    {entry.done
                      ? entry.action.kind === "unlink"
                        ? "Put back"
                        : "Restore"
                      : "Redo"}
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
    </div>
  );
}
