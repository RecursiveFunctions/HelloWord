"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UploadCloud, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { LibraryItem, LibraryItemType } from "../../library/items";
import { useFileDrop, useNotebookUpload } from "../use-notebook-upload";
import { AddMenu } from "./add-menu";
import {
  useWorkspaceView,
  WorkspaceViewToggle,
  type WorkspaceView,
} from "../workspace-view";

const SECTIONS: { type: LibraryItemType; heading: string; empty: string }[] = [
  { type: "source", heading: "Sources", empty: "No sources referenced yet." },
  { type: "note", heading: "Notes", empty: "No notes referenced yet." },
  { type: "extract", heading: "Extracts", empty: "No extracts referenced yet." },
  {
    type: "activity",
    heading: "Activities",
    empty: "No activities referenced yet.",
  },
];

export function NotebookContents({
  notebookId,
  items: libraryRows,
  libraryItems,
  initialView = "cards",
  fromQuery = false,
}: {
  notebookId: string;
  items: LibraryItem[];
  /** Library items not yet in this notebook, for the "Add from library" picker. */
  libraryItems: LibraryItem[];
  initialView?: WorkspaceView;
  fromQuery?: boolean;
}) {
  const router = useRouter();
  // Carry the notebook into the reader so its breadcrumb can show where you came from.
  const items = libraryRows.map((item) =>
    item.href
      ? { ...item, href: `${item.href}?notebook=${notebookId}` }
      : item,
  );
  const { view, choose } = useWorkspaceView({ initialView, fromQuery });
  const [removing, setRemoving] = useState<string | null>(null);
  const { upload, busy, notice, supported } = useNotebookUpload(notebookId);
  const [localError, setLocalError] = useState<string | null>(null);
  const { active, handlers } = useFileDrop((files) => void upload(files));

  // Sources extract in the background; re-render until they settle.
  const ingesting = items.some(
    (item) => item.status === "pending" || item.status === "processing",
  );
  useEffect(() => {
    if (!ingesting) return;
    const timer = setInterval(() => router.refresh(), 1500);
    return () => clearInterval(timer);
  }, [ingesting, router]);

  async function remove(item: LibraryItem) {
    const key = `${item.type}:${item.id}`;
    setRemoving(key);

    const params = new URLSearchParams({
      item_type: item.type,
      item_id: item.id,
    });
    await fetch(`/api/notebooks/${notebookId}/items?${params}`, {
      method: "DELETE",
    });

    setRemoving(null);
    router.refresh();
  }

  return (
    <div
      {...handlers}
      className={cn(
        "relative space-y-8 rounded-xl transition-shadow",
        active && "ring-2 ring-primary ring-offset-8 ring-offset-background",
      )}
    >
      {active ? (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-xl bg-background/80 backdrop-blur-sm">
          <p className="flex items-center gap-2 text-lg font-medium">
            <UploadCloud className="size-5" /> Drop to add to this notebook
          </p>
        </div>
      ) : null}

      <AddMenu
        notebookId={notebookId}
        libraryItems={libraryItems}
        busy={busy}
        onFiles={(files) => void upload(files)}
        onError={setLocalError}
      />
      <p className="-mt-4 text-sm text-muted-foreground">
        Or drop {supported} files anywhere on this page.
      </p>

      {items.length > 0 ? (
        <div className="flex justify-end">
          <WorkspaceViewToggle view={view} onChange={choose} />
        </div>
      ) : null}

      {notice || localError ? (
        <p
          role="status"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            notice?.tone === "info" ? "bg-accent/50" : "text-destructive",
          )}
        >
          {localError ?? notice?.text}
        </p>
      ) : null}

      {SECTIONS.map((section) => {
        const rows = items.filter((item) => item.type === section.type);
        return (
          <section key={section.type}>
            <h2 className="mb-3 flex items-center gap-3 font-heading text-xl tracking-tight sm:text-2xl">
              {section.heading}
              {rows.length > 0 ? (
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-sm font-medium text-muted-foreground">
                  {rows.length}
                </span>
              ) : null}
            </h2>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{section.empty}</p>
            ) : view === "cards" ? (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {rows.map((item) => (
                  <ItemCard
                    key={`${item.type}:${item.id}`}
                    item={item}
                    removing={removing === `${item.type}:${item.id}`}
                    onRemove={() => void remove(item)}
                  />
                ))}
              </div>
            ) : (
              <ul className="divide-y rounded-xl border bg-card">
                {rows.map((item) => {
                  const key = `${item.type}:${item.id}`;
                  return (
                    <li
                      key={key}
                      className="flex items-start gap-3 px-4 py-2.5 text-sm"
                    >
                      <ItemCopy item={item} />
                      <ItemActions
                        item={item}
                        removing={removing === key}
                        onRemove={() => void remove(item)}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function ItemCard({
  item,
  removing,
  onRemove,
}: {
  item: LibraryItem;
  removing: boolean;
  onRemove: () => void;
}) {
  const preview = (
    item.previewSrc ? (
      <img
        src={item.previewSrc}
        alt={`Preview of ${item.title}`}
        className="aspect-[16/10] w-full object-cover"
      />
    ) : (
      <div className="flex aspect-[16/10] items-center justify-center border-b border-dashed text-sm text-muted-foreground">
        No preview yet
      </div>
    )
  );

  return (
    <Card className="h-full pt-0">
      {item.href ? (
        <Link href={item.href} className="block">
          {preview}
        </Link>
      ) : (
        preview
      )}
      <CardHeader>
        <CardTitle>
          {item.href ? (
            <Link href={item.href} className="hover:underline">
              {item.title}
            </Link>
          ) : (
            item.title
          )}
        </CardTitle>
        {item.meta.length > 0 ? (
          <CardDescription>{item.meta.join(" · ")}</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex items-center justify-end">
        <ItemActions item={item} removing={removing} onRemove={onRemove} />
      </CardContent>
    </Card>
  );
}

function ItemCopy({ item }: { item: LibraryItem }) {
  return (
    <div className="min-w-0 flex-1">
      {item.href ? (
        <Link href={item.href} className="font-medium hover:underline">
          {item.title}
        </Link>
      ) : (
        <span className="font-medium">{item.title}</span>
      )}
      {item.meta.length > 0 ? (
        <p className="text-xs text-muted-foreground">{item.meta.join(" · ")}</p>
      ) : null}
    </div>
  );
}

function ItemActions({
  item,
  removing,
  onRemove,
}: {
  item: LibraryItem;
  removing: boolean;
  onRemove: () => void;
}) {
  return (
    <>
      {item.status && item.status !== "ready" ? (
        <Badge variant="outline">{item.status}</Badge>
      ) : null}

      <Button
        size="icon-touch"
        variant="ghost"
        aria-label={`Remove ${item.title} from this notebook`}
        disabled={removing}
        onClick={onRemove}
      >
        <X />
      </Button>
    </>
  );
}
