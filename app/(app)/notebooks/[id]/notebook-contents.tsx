"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { LibraryItem, LibraryItemType } from "../../library/items";

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
  items,
}: {
  notebookId: string;
  items: LibraryItem[];
}) {
  const router = useRouter();
  const [removing, setRemoving] = useState<string | null>(null);

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
    <>
      {SECTIONS.map((section) => {
        const rows = items.filter((item) => item.type === section.type);
        return (
          <section key={section.type}>
            <h2 className="mb-3 font-heading text-lg">
              {section.heading}
              {rows.length > 0 ? (
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  {rows.length}
                </span>
              ) : null}
            </h2>

            {rows.length === 0 ? (
              <p className="text-sm text-muted-foreground">{section.empty}</p>
            ) : (
              <ul className="divide-y rounded-xl border bg-card">
                {rows.map((item) => {
                  const key = `${item.type}:${item.id}`;
                  return (
                    <li
                      key={key}
                      className="flex items-start gap-3 px-4 py-2.5 text-sm"
                    >
                      <div className="min-w-0 flex-1">
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
                        {item.meta.length > 0 ? (
                          <p className="text-xs text-muted-foreground">
                            {item.meta.join(" · ")}
                          </p>
                        ) : null}
                      </div>

                      {item.status && item.status !== "ready" ? (
                        <Badge variant="outline">{item.status}</Badge>
                      ) : null}

                      <Button
                        size="icon-xs"
                        variant="ghost"
                        aria-label={`Remove ${item.title} from this notebook`}
                        disabled={removing === key}
                        onClick={() => void remove(item)}
                      >
                        <X />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </>
  );
}
