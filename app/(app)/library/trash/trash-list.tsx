"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RotateCcw, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { toast } from "@/components/ui/toast";
import { restoreFromTrash } from "@/lib/client/trash";
import type { TrashType } from "@/lib/store/trash";

export type TrashRowModel = {
  type: TrashType;
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  deletedAt: string;
  daysLeft: number;
};

type Confirm = { kind: "one"; row: TrashRowModel } | { kind: "all" } | null;

export function TrashList({ rows }: { rows: TrashRowModel[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);

  async function restore(row: TrashRowModel) {
    setBusy(`${row.type}:${row.id}`);
    const ok = await restoreFromTrash(row);
    setBusy(null);
    if (!ok) {
      toast.add({ title: `Could not restore “${row.title}”.`, type: "error" });
      return;
    }
    toast.add({ title: `Restored “${row.title}”`, timeout: 4000 });
    router.refresh();
  }

  async function purge() {
    const target = confirm;
    setConfirm(null);
    if (!target) return;

    const response =
      target.kind === "all"
        ? await fetch("/api/trash", { method: "DELETE" })
        : await fetch(`/api/trash/${target.row.type}/${target.row.id}`, {
            method: "DELETE",
          });
    if (!response.ok) {
      toast.add({ title: "Could not delete that.", type: "error" });
      return;
    }
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing recently deleted</EmptyTitle>
          <EmptyDescription>
            Items you delete from the Library or Notebooks land here first.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? "item" : "items"}
        </p>
        <Button
          variant="destructive"
          size="touch"
          onClick={() => setConfirm({ kind: "all" })}
        >
          <Trash2 /> Empty trash
        </Button>
      </div>

      <ul className="divide-y rounded-xl border bg-card">
        {rows.map((row) => {
          const key = `${row.type}:${row.id}`;
          return (
            <li key={key} className="flex items-start gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{row.title}</span>
                  <Badge variant="outline">{row.type}</Badge>
                </div>
                {row.subtitle ? (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {row.subtitle}
                  </p>
                ) : null}
                <p className="mt-1 text-xs text-muted-foreground">
                  Deleted {new Date(row.deletedAt).toLocaleDateString()} ·{" "}
                  {row.daysLeft === 0
                    ? "removed today"
                    : `${row.daysLeft} ${row.daysLeft === 1 ? "day" : "days"} left`}
                </p>
              </div>
              <Button
                size="touch"
                variant="outline"
                disabled={busy === key}
                onClick={() => void restore(row)}
              >
                <RotateCcw /> Restore
              </Button>
              <Button
                size="icon-touch"
                variant="ghost"
                className="text-muted-foreground hover:text-destructive"
                aria-label={`Delete ${row.title} forever`}
                onClick={() => setConfirm({ kind: "one", row })}
              >
                <Trash2 />
              </Button>
            </li>
          );
        })}
      </ul>

      <AlertDialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) setConfirm(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirm?.kind === "all"
                ? "Empty Recently deleted?"
                : "Delete forever?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirm?.kind === "all"
                ? `All ${rows.length} items will be removed permanently. This cannot be undone.`
                : confirm?.kind === "one"
                  ? `“${confirm.row.title}” will be removed permanently. This cannot be undone.`
                  : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void purge()}>
              Delete forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
