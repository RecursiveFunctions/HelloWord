"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

export function NewNotebook() {
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
      <Button onClick={() => setOpen(true)}>
        <Plus className="size-4" /> New notebook
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New notebook</DialogTitle>
            <DialogDescription>
              A notebook collects references. Adding a source here does not move
              it out of the Library.
            </DialogDescription>
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
              <div className="flex gap-2">
                {NOTEBOOK_COLORS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    aria-label={option.label}
                    aria-pressed={color === option.swatch}
                    onClick={() => setColor(option.swatch)}
                    className={cn(
                      "size-6 rounded-full shadow-[0_0_0_1px_rgba(0,0,0,0.12)] ring-offset-2 ring-offset-background transition-shadow",
                      color === option.swatch && "ring-2 ring-ring",
                    )}
                    style={{ background: option.swatch }}
                  />
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
                onClick={() => setOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? <Spinner /> : null} Create
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
