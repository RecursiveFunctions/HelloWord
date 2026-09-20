"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Spinner } from "@/components/ui/spinner";
import { trashWithUndo } from "@/lib/client/trash";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibraryItemType } from "./items";

const FILTERS: { id: LibraryItemType | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "source", label: "Sources" },
  { id: "note", label: "Notes" },
  { id: "extract", label: "Extracts" },
  { id: "activity", label: "Activities" },
];

/** While anything is mid-ingest, re-render the server component on a timer. */
const POLL_MS = 1500;

export function LibraryBrowser({
  items,
  notebooks,
}: {
  items: LibraryItem[];
  notebooks: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [filter, setFilter] = useState<LibraryItemType | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [target, setTarget] = useState(notebooks[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ingesting = items.some(
    (item) => item.status === "pending" || item.status === "processing",
  );

  useEffect(() => {
    if (!ingesting) return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [ingesting, router]);

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((item) => {
      if (filter !== "all" && item.type !== filter) return false;
      if (!needle) return true;
      return `${item.title} ${item.subtitle}`.toLowerCase().includes(needle);
    });
  }, [items, filter, search]);

  function toggle(key: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  async function addSelected() {
    if (!target || selected.size === 0) return;
    setAdding(true);
    setMessage(null);

    const payload = [...selected].map((key) => {
      const [item_type, item_id] = key.split(":");
      return { item_type: item_type as LibraryItemType, item_id };
    });

    const response = await fetch(`/api/notebooks/${target}/items`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ items: payload }),
    });

    setAdding(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage(body.error ?? "Could not add those items.");
      return;
    }

    const body = await response.json();
    const name = notebooks.find((n) => n.id === target)?.name ?? "notebook";
    const already = body.requested - body.added.length;
    setMessage(
      `Added ${body.added.length} to ${name}${already > 0 ? ` (${already} already there)` : ""}.`,
    );
    setSelected(new Set());
    router.refresh();
  }

  function trash(item: LibraryItem) {
    setSelected((current) => {
      const next = new Set(current);
      next.delete(`${item.type}:${item.id}`);
      return next;
    });
    void trashWithUndo({ type: item.type, id: item.id }, item.title, () =>
      router.refresh(),
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-center">
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 md:mx-0 md:flex-wrap md:overflow-visible md:px-0 md:pb-0">
          {FILTERS.map((option) => (
            <Button
              key={option.id}
              size="touch"
              variant={filter === option.id ? "default" : "outline"}
              onClick={() => setFilter(option.id)}
              className="shrink-0 rounded-full"
            >
              {option.label}
            </Button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search the library"
          className="h-11 w-full text-base md:ml-auto md:max-w-sm"
        />
      </div>

      {selected.size > 0 ? (
        // Sticky: the list runs to several thousand pixels, and selecting
        // something near the bottom should not mean scrolling back to the top
        // to act on it.
        <div className="sticky top-2 z-10 flex flex-wrap items-center gap-2 rounded-lg border bg-card/95 px-3 py-2 shadow-sm backdrop-blur">
          <span className="text-base font-medium">{selected.size} selected</span>
          <NativeSelect
            size="default"
            value={target}
            onChange={(event) => setTarget(event.target.value)}
            className="ml-auto h-11 w-auto text-base"
          >
            {notebooks.map((notebook) => (
              <NativeSelectOption key={notebook.id} value={notebook.id}>
                {notebook.name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <Button size="touch" onClick={addSelected} disabled={adding || !target}>
            {adding ? <Spinner /> : <Plus className="size-4" />} Add to notebook
          </Button>
          <Button
            size="touch"
            variant="ghost"
            onClick={() => setSelected(new Set())}
          >
            Clear
          </Button>
        </div>
      ) : null}

      {message ? (
        <p
          className="rounded-lg border bg-accent/50 px-3 py-2 text-sm"
          role="status"
        >
          {message}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>Nothing here yet</EmptyTitle>
            <EmptyDescription>
              {search
                ? "No item matches that search."
                : "Add a PDF or paste a URL above. Every source becomes markdown before anything else touches it."}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="divide-y rounded-xl border bg-card">
          {visible.map((item) => {
            const key = `${item.type}:${item.id}`;
            const checked = selected.has(key);
            return (
              <li
                key={key}
                className={cn(
                  "flex items-start gap-3 px-4 py-3",
                  checked && "bg-accent/40",
                )}
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() => toggle(key)}
                  className="mt-1"
                  aria-label={`Select ${item.title}`}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {item.href ? (
                      <Link
                        href={item.href}
                        className="font-medium hover:underline"
                      >
                        {item.title}
                      </Link>
                    ) : (
                      <span className="font-medium">{item.title}</span>
                    )}
                    <Badge variant="outline">{item.type}</Badge>
                    {item.status ? <StatusBadge status={item.status} /> : null}
                  </div>

                  {item.subtitle ? (
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {item.subtitle}
                    </p>
                  ) : null}

                  {item.meta.length > 0 ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.meta.join(" · ")}
                    </p>
                  ) : null}

                  {item.error ? (
                    <p className="mt-1 flex items-start gap-1.5 text-xs text-destructive">
                      <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                      {item.error}
                    </p>
                  ) : null}
                </div>
                <Button
                  size="icon-touch"
                  variant="ghost"
                  className="-my-1 shrink-0 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete ${item.title}`}
                  onClick={() => trash(item)}
                >
                  <Trash2 />
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "ready") return <Badge variant="secondary">ready</Badge>;
  if (status === "failed") return <Badge variant="outline">failed</Badge>;
  return (
    <Badge variant="outline" className="gap-1">
      <Spinner className="size-3" />
      {status}
    </Badge>
  );
}
