"use client";

import { LayoutGrid, List } from "lucide-react";
import { useEffect, useState } from "react";
import { buttonVariants } from "@/components/ui/button";

export const WORKSPACE_VIEW_KEY = "helloword.workspace.view";

export type WorkspaceView = "list" | "cards";

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
  const [view, setView] = useState<WorkspaceView>(initialView);

  useEffect(() => {
    if (fromQuery) {
      setView(initialView);
      return;
    }
    const stored = window.localStorage.getItem(WORKSPACE_VIEW_KEY);
    if (isWorkspaceView(stored)) setView(stored);
  }, [fromQuery, initialView]);

  function choose(next: WorkspaceView) {
    setView(next);
    window.localStorage.setItem(WORKSPACE_VIEW_KEY, next);
  }

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
    <div className="flex gap-1" aria-label={label ?? "Workspace view"}>
      <button
        type="button"
        className={buttonVariants({
          size: "sm",
          variant: view === "list" ? "secondary" : "outline",
        })}
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <List /> List
      </button>
      <button
        type="button"
        className={buttonVariants({
          size: "sm",
          variant: view === "cards" ? "secondary" : "outline",
        })}
        aria-pressed={view === "cards"}
        onClick={() => onChange("cards")}
      >
        <LayoutGrid /> Cards
      </button>
    </div>
  );
}
