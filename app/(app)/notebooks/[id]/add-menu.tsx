"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Link2, StickyNote, Upload } from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { Spinner } from "@/components/ui/spinner";
import { addUrl, createNote, FILE_ACCEPT } from "@/lib/client/upload";
import type { LibraryItem } from "../../library/items";
import { cn } from "@/lib/utils";
import { AddFromLibrary } from "./add-from-library";

/**
 * One place to put things into a notebook. Everything created here is also
 * saved to the Library, so the notebook stays the everyday surface.
 */
export function AddMenu({
  notebookId,
  libraryItems,
  busy,
  onFiles,
  onError,
}: {
  notebookId: string;
  libraryItems: LibraryItem[];
  busy: boolean;
  onFiles: (files: File[]) => void;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [urlOpen, setUrlOpen] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [url, setUrl] = useState("");
  const [working, setWorking] = useState(false);
  const [urlError, setUrlError] = useState<string | null>(null);

  async function submitUrl() {
    if (!url.trim()) return;
    setWorking(true);
    setUrlError(null);
    const result = await addUrl(url, { notebookId });
    setWorking(false);
    if (!result.ok) {
      setUrlError(result.error);
      return;
    }
    setUrl("");
    setUrlOpen(false);
    router.refresh();
  }

  async function newNote() {
    setWorking(true);
    const result = await createNote({ notebookId });
    if (!result.ok) {
      setWorking(false);
      onError(result.error);
      return;
    }
    router.push(`/notes/${result.id}?notebook=${notebookId}`);
  }

  return (
    <>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept={FILE_ACCEPT}
        className="hidden"
        onChange={(event) => {
          const files = Array.from(event.target.files ?? []);
          event.target.value = "";
          onFiles(files);
        }}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <AddTile
          icon={Upload}
          label="Upload file"
          hint="PDF, text, images"
          disabled={busy || working}
          busy={busy}
          onClick={() => fileInput.current?.click()}
        />
        <AddTile
          icon={Link2}
          label="Paste URL"
          hint="Save a web page"
          disabled={busy || working}
          onClick={() => setUrlOpen(true)}
        />
        <AddTile
          icon={StickyNote}
          label="New note"
          hint="Write something down"
          disabled={busy || working}
          busy={working}
          onClick={() => void newNote()}
        />
        <AddTile
          icon={BookMarked}
          label="From library"
          hint="Reuse a saved item"
          disabled={busy || working}
          onClick={() => setLibraryOpen(true)}
        />
      </div>

      <Dialog open={urlOpen} onOpenChange={setUrlOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a web page</DialogTitle>
            <DialogDescription>
              It is saved to your library and added to this notebook.
            </DialogDescription>
          </DialogHeader>
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submitUrl();
            }}
          >
            <Input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://example.com/an-article"
              type="url"
              className="h-11 text-base"
              autoFocus
              disabled={working}
            />
            {urlError ? (
              <p className="text-sm text-destructive" role="alert">
                {urlError}
              </p>
            ) : null}
            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                size="touch"
                onClick={() => setUrlOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="touch" disabled={working || !url.trim()}>
                {working ? <Spinner /> : null} Add
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AddFromLibrary
        notebookId={notebookId}
        items={libraryItems}
        open={libraryOpen}
        onOpenChange={setLibraryOpen}
      />
    </>
  );
}

function AddTile({
  icon: Icon,
  label,
  hint,
  onClick,
  disabled,
  busy,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex min-h-24 items-center gap-4 rounded-xl border bg-card px-4 py-3 text-left transition-colors",
        "hover:border-primary hover:bg-accent/40 active:translate-y-px focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        {busy ? <Spinner className="size-6" /> : <Icon className="size-7" />}
      </span>
      <span className="min-w-0">
        <span className="block font-heading text-lg leading-tight">{label}</span>
        <span className="block truncate text-sm text-muted-foreground">
          {hint}
        </span>
      </span>
    </button>
  );
}
