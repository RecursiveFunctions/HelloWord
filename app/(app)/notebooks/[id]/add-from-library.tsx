"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { linkToNotebook } from "@/lib/client/upload";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "../../library/items";

const TYPES: { id: LibraryItem["type"] | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "source", label: "Sources" },
  { id: "note", label: "Notes" },
  { id: "extract", label: "Extracts" },
  { id: "activity", label: "Activities" },
];

/** Pick existing Library items that are not yet in this notebook. */
export function AddFromLibrary({
  notebookId,
  items,
  open,
  onOpenChange,
}: {
  notebookId: string;
  items: LibraryItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [type, setType] = useState<LibraryItem["type"] | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (type !== "all" && item.type !== type) return false;
      return (
        !needle || `${item.title} ${item.subtitle}`.toLowerCase().includes(needle)
      );
    });
  }, [items, type, search]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  async function add() {
    if (selected.size === 0) return;
    setBusy(true);
    setError(null);

    const result = await linkToNotebook(
      notebookId,
      [...selected].map((key) => {
        const [item_type, item_id] = key.split(":");
        return { item_type, item_id };
      }),
    );

    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setSelected(new Set());
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add from library</DialogTitle>
          <DialogDescription>
            Pick items you already have. They stay in the library and appear
            here too.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap items-center gap-1">
          {TYPES.map((option) => (
            <Button
              key={option.id}
              size="sm"
              variant={type === option.id ? "default" : "ghost"}
              onClick={() => setType(option.id)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the library"
        />

        {visible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {items.length === 0
              ? "Everything in your library is already in this notebook."
              : "Nothing matches."}
          </p>
        ) : (
          <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
            {visible.map((item) => {
              const key = `${item.type}:${item.id}`;
              const checked = selected.has(key);
              return (
                <li key={key}>
                  <label
                    className={cn(
                      "flex cursor-pointer items-start gap-3 px-3 py-2",
                      checked && "bg-accent/40",
                    )}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggle(key)}
                      className="mt-1"
                      aria-label={`Select ${item.title}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{item.title}</span>
                        <Badge variant="outline">{item.type}</Badge>
                      </span>
                      {item.meta.length > 0 ? (
                        <span className="block truncate text-xs text-muted-foreground">
                          {item.meta.join(" · ")}
                        </span>
                      ) : null}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}

        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={add} disabled={busy || selected.size === 0}>
            {busy ? <Spinner /> : <Plus className="size-4" />} Add
            {selected.size > 0 ? ` ${selected.size}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
