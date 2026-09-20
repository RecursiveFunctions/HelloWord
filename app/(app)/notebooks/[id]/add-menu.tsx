"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookMarked, Link2, Plus, StickyNote, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { addUrl, createNote, FILE_ACCEPT } from "@/lib/client/upload";
import type { LibraryItem } from "../../library/items";
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
    router.push(`/read/${result.id}`);
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

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button disabled={busy || working}>
              {busy || working ? <Spinner /> : <Plus className="size-4" />} Add
            </Button>
          }
        />
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onClick={() => fileInput.current?.click()}>
            <Upload /> Upload file
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setUrlOpen(true)}>
            <Link2 /> Paste URL
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => void newNote()}>
            <StickyNote /> New note
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setLibraryOpen(true)}>
            <BookMarked /> Add from library
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

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
                onClick={() => setUrlOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={working || !url.trim()}>
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
