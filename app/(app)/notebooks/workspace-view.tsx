"use client";

import { LayoutGrid, List } from "lucide-react";
import { useCallback, useSyncExternalStore } from "react";
import { buttonVariants } from "@/components/ui/button";

export const WORKSPACE_VIEW_KEY = "helloword.workspace.view";

export type WorkspaceView = "list" | "cards";

const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readStored(): WorkspaceView {
  const stored = window.localStorage.getItem(WORKSPACE_VIEW_KEY);
  return isWorkspaceView(stored) ? stored : "cards";
}

export function isWorkspaceView(
  value: string | null | undefined,
): value is WorkspaceView {
  return value === "list" || value === "cards";
}

export function useWorkspaceView({
  initialView = "cards",
  fromQuery = false,
}: {
  initialView?: WorkspaceView;
  fromQuery?: boolean;
} = {}) {
  const stored = useSyncExternalStore(subscribe, readStored, () => initialView);
  const view = fromQuery ? initialView : stored;

  const choose = useCallback((next: WorkspaceView) => {
    window.localStorage.setItem(WORKSPACE_VIEW_KEY, next);
    emit();
  }, []);

  return { view, choose };
}

export function WorkspaceViewToggle({
  view,
  onChange,
  label,
}: {
  view: WorkspaceView;
  onChange: (next: WorkspaceView) => void;
  label?: string;
}) {
  return (
    <div className="flex gap-2" aria-label={label ?? "Workspace view"}>
      <button
        type="button"
        className={buttonVariants({
          size: "touch",
          variant: view === "list" ? "secondary" : "outline",
        })}
        aria-label="List view"
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <List /> <span className="hidden sm:inline">List</span>
      </button>
      <button
        type="button"
        className={buttonVariants({
          size: "touch",
          variant: view === "cards" ? "secondary" : "outline",
        })}
        aria-label="Card view"
        aria-pressed={view === "cards"}
        onClick={() => onChange("cards")}
      >
        <LayoutGrid /> <span className="hidden sm:inline">Cards</span>
      </button>
    </div>
  );
}
