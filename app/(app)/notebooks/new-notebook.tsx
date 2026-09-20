"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { Textarea } from "@/components/ui/textarea";
import { NOTEBOOK_COLORS } from "@/lib/themes";
import { cn } from "@/lib/utils";
import { uploadNotebookCover } from "./replace-cover";

export function NewNotebook({
  variant = "button",
}: {
  /** "button" for the header; "card" and "row" are big tiles that sit among the notebooks. */
  variant?: "button" | "card" | "row";
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(NOTEBOOK_COLORS[0].swatch);
  const [cover, setCover] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    setError(null);

    const response = await fetch("/api/notebooks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim() || undefined,
        color,
      }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setBusy(false);
      setError(
        (body as { error?: string }).error ?? "Could not create that notebook.",
      );
      return;
    }

    const body = (await response.json()) as { notebook?: { id: string } };
    const notebookId = body.notebook?.id;
    if (notebookId && cover) {
      const message = await uploadNotebookCover(notebookId, cover);
      if (message) {
        setBusy(false);
        setError(message);
        router.refresh();
        return;
      }
    }

    setBusy(false);
    setName("");
    setDescription("");
    setCover(null);
    setFileKey((key) => key + 1);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {variant === "button" ? (
        <Button size="touch" onClick={() => setOpen(true)}>
          <Plus /> New notebook
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={cn(
            "flex items-center justify-center gap-3 rounded-xl border-2 border-dashed text-muted-foreground transition-colors hover:border-primary hover:bg-accent/40 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
            variant === "card"
              ? "min-h-64 flex-col"
              : "min-h-16 w-full flex-row",
          )}
        >
          <Plus className={variant === "card" ? "size-12" : "size-7"} />
          <span className="font-heading text-lg">New notebook</span>
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
          </DialogHeader>

          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="notebook-name">Topic name</Label>
              <Input
                id="notebook-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Spaced repetition"
                className="h-11 text-base"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="notebook-description">Topic description</Label>
              <Textarea
                id="notebook-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this collection is for."
                rows={3}
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="notebook-cover">Note screenshot</Label>
              <Input
                key={fileKey}
                id="notebook-cover"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                onChange={(event) =>
                  setCover(event.target.files?.[0] ?? null)
                }
              />
              <p className="text-xs text-muted-foreground">
                Optional. PNG, JPEG, WebP, or SVG, up to 2 MB.
              </p>
            </div>

            <div className="grid gap-1.5">
              <Label>Colour</Label>
              <div className="flex flex-wrap gap-3">
                {NOTEBOOK_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={color === option.swatch}
                    onClick={() => setColor(option.swatch)}
                    className={cn(
                      "flex size-10 items-center justify-center rounded-full text-white shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ring-offset-2 ring-offset-background transition-shadow",
                      color === option.swatch && "ring-2 ring-ring",
                    )}
                    style={{ background: option.swatch }}
                  >
                    {color === option.swatch ? <Check className="size-5" /> : null}
                  </button>
                ))}
              </div>
            </div>

            {error ? (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                size="touch"
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="touch" disabled={busy || !name.trim()}>
                {busy ? <Spinner /> : null} Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
