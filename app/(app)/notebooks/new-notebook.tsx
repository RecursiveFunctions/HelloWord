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
import { cn } from "@/lib/utils";

const COLORS = [
  "#c2410c",
  "#1d4ed8",
  "#15803d",
  "#7e22ce",
  "#b91c1c",
  "#0f766e",
];

export function NewNotebook() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(COLORS[0]);
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

    setBusy(false);

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setError(body.error ?? "Could not create that notebook.");
      return;
    }

    setName("");
    setDescription("");
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
              <Label htmlFor="notebook-name">Name</Label>
              <Input
                id="notebook-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Spaced repetition"
                autoFocus
              />
            </div>

            <div className="grid gap-1.5">
              <Label htmlFor="notebook-description">Description</Label>
              <Textarea
                id="notebook-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this collection is for."
                rows={3}
              />
            </div>

            <div className="grid gap-1.5">
              <Label>Colour</Label>
              <div className="flex gap-2">
                {COLORS.map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-label={`Use ${option}`}
                    aria-pressed={color === option}
                    onClick={() => setColor(option)}
                    className={cn(
                      "size-6 rounded-full ring-offset-2 ring-offset-background transition-shadow",
                      color === option && "ring-2 ring-ring",
                    )}
                    style={{ background: option }}
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
