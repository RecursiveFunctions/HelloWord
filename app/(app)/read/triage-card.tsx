"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { ActivityDraftList } from "@/components/activity-draft-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Kbd } from "@/components/ui/kbd";
import { Skeleton } from "@/components/ui/skeleton";
import type { ReadingAction } from "@/lib/api";
import type { ActivityPayload } from "@/lib/contracts/activity";
import type { ReadingItem } from "@/lib/reading/queue";
import type { DistillDraftRow } from "@/lib/store/types";
import { NoteEditor } from "./[id]/note-editor";
import { SourcePane } from "./[id]/source-pane";

export type NoteEdit = { title: string; body_md: string };

const NONE: ReadonlySet<number> = new Set();

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

export function TriageCard({
  item,
  markdown,
  draft,
  edit,
  dropped = NONE,
  busy,
  onEdit,
  onToggleCard,
  onApprove,
  onAction,
  onPriority,
  onRetry,
}: {
  item: ReadingItem;
  /** The whole source, so the passage can be read in place. */
  markdown: string | undefined;
  draft: DistillDraftRow | undefined;
  /** The reader's changes to the drafted note; absent until they type. */
  edit: NoteEdit | undefined;
  /** Indexes of drafted cards the reader unticked. */
  dropped?: ReadonlySet<number>;
  busy: boolean;
  onEdit: (edit: NoteEdit) => void;
  onToggleCard: (index: number, keep: boolean) => void;
  onApprove: (note: NoteEdit, activities: ActivityPayload[]) => void;
  onAction: (action: ReadingAction) => void;
  /** -1 sooner, +1 later. */
  onPriority: (delta: -1 | 1) => void;
  onRetry: () => void;
}) {
  const router = useRouter();
  const editorRef = useRef<HTMLDivElement>(null);

  const hasNote = Boolean(draft?.note_body_md);
  const note: NoteEdit = edit ?? {
    title: draft?.note_title ?? "",
    body_md: draft?.note_body_md ?? "",
  };
  const cards = draft?.activities ?? [];
  const kept = cards.filter((_, index) => !dropped.has(index));
  const selected = new Set(cards.map((_, index) => index).filter((index) => !dropped.has(index)));

  // Approvable once the cards are in, or once it is clear they are not coming.
  const canApprove =
    !busy &&
    hasNote &&
    (draft?.status === "ready" || draft?.status === "failed") &&
    note.title.trim().length > 0 &&
    note.body_md.trim().length > 0;
  const readerHref = `/read/${item.source_id}`;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) {
        // Escape hands the keyboard back to the queue.
        if (event.key === "Escape") (event.target as HTMLElement).blur();
        return;
      }
      if (busy) return;

      const key = event.key.toLowerCase();
      if (key === "enter") {
        if (!canApprove) return;
        event.preventDefault();
        onApprove(note, kept);
      } else if (key === "k") onAction("next");
      else if (key === "p") onAction("postpone");
      else if (key === "d") onAction("dismiss");
      else if (key === "+" || key === "=") onPriority(-1);
      else if (key === "-") onPriority(1);
      else if (key === "o") router.push(readerHref);
      else if (key === "r" && draft?.status === "failed") onRetry();
      else if (key === "e") {
        event.preventDefault();
        editorRef.current?.querySelector<HTMLElement>("[contenteditable=true]")?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <Card>
      <CardContent className="grid gap-8 lg:grid-cols-2">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <Badge variant="outline">priority {item.priority}</Badge>
            {!item.accepted ? <Badge variant="secondary">AI proposal</Badge> : null}
            {item.queue_reps > 0 ? <Badge variant="secondary">seen {item.queue_reps}×</Badge> : null}
            {item.suggestion_concepts.map((concept) => (
              <Badge key={concept} variant="secondary">
                {concept}
              </Badge>
            ))}
            <Link href={readerHref} className="ml-auto truncate underline-offset-4 hover:underline">
              {item.source_title}
            </Link>
          </div>
          {item.suggestion_reason ? (
            <p className="mb-4 text-sm text-muted-foreground">{item.suggestion_reason}</p>
          ) : null}
          {markdown ? (
            // Condensed around this one passage: its block and heading, with
            // the rest of the source one click away in the gaps.
            <div className="max-h-[60svh] overflow-y-auto pr-2">
              <SourcePane
                markdown={markdown}
                condensed
                extracts={[{ id: item.id, start: item.selector.start, end: item.selector.end }]}
              />
            </div>
          ) : (
            <p className="font-serif text-[17px] leading-8">{item.body_md}</p>
          )}
        </section>

        <section className="min-w-0 space-y-4">
          {hasNote ? (
            <>
              <Input
                aria-label="Note title"
                value={note.title}
                onChange={(event) => onEdit({ ...note, title: event.target.value })}
              />
              <div ref={editorRef}>
                <NoteEditor
                  body={note.body_md}
                  onBodyChange={(body_md) => {
                    // Tiptap reports its initial parse; that is not an edit.
                    if (body_md !== note.body_md) onEdit({ ...note, body_md });
                  }}
                  disabled={busy}
                />
              </div>
            </>
          ) : draft?.status === "failed" ? null : (
            <div className="space-y-3" aria-busy>
              <p className="text-sm text-muted-foreground">Drafting a note from this passage…</p>
              <Skeleton className="h-9 w-2/3" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {draft?.status === "failed" ? (
            <p className="text-sm text-destructive" role="alert">
              {hasNote ? "The cards could not be drafted" : "The note could not be drafted"}
              {draft.error ? `: ${draft.error}` : "."}{" "}
              <button type="button" className="underline underline-offset-2" onClick={onRetry}>
                Retry
              </button>
              {hasNote ? " or approve the note on its own." : null}
            </p>
          ) : null}

          {cards.length > 0 ? (
            <ActivityDraftList activities={cards} selected={selected} onToggle={onToggleCard} />
          ) : hasNote && draft?.status !== "failed" ? (
            <div className="space-y-3" aria-busy>
              <p className="text-sm text-muted-foreground">Drafting cards from the note…</p>
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : null}
        </section>

        <footer className="flex flex-wrap items-center gap-2 border-t pt-4 lg:col-span-2">
          <Button disabled={!canApprove} onClick={() => onApprove(note, kept)}>
            Approve{kept.length ? ` with ${kept.length} card${kept.length === 1 ? "" : "s"}` : ""} <Kbd>↵</Kbd>
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => onAction("next")}>
            Keep for later <Kbd>K</Kbd>
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => onAction("postpone")}>
            Postpone <Kbd>P</Kbd>
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => onAction("dismiss")}>
            Dismiss <Kbd>D</Kbd>
          </Button>
          <span className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onPriority(-1)}>
              Sooner <Kbd>+</Kbd>
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onPriority(1)}>
              Later <Kbd>-</Kbd>
            </Button>
          </span>
          <p className="w-full text-xs text-muted-foreground">
            <Kbd>E</Kbd> edit the note · <Kbd>Esc</Kbd> back to the queue · <Kbd>O</Kbd> open the source
            {draft?.status === "failed" ? (
              <>
                {" "}· <Kbd>R</Kbd> retry
              </>
            ) : null}
          </p>
        </footer>
      </CardContent>
    </Card>
  );
}
