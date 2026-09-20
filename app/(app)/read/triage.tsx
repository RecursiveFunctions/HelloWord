"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import type { ReadingAction } from "@/lib/api";
import { readJson } from "@/lib/client/json";
import type { ActivityPayload } from "@/lib/contracts/activity";
import type { ReadingItem } from "@/lib/reading/queue";
import type { DistillDraftRow, ExtractRow } from "@/lib/store/types";
import { TriageCard, type NoteEdit } from "./triage-card";

/** Draft this many ahead, so the next passage is ready when the reader is. */
const PREFETCH = 3;
const POLL_MS = 2_000;
/** Two stages, plus slack for waiting out someone else's claim. */
const MAX_DRIVE_STEPS = 45;
const PRIORITY_STEP = 10;

const settled = (draft: DistillDraftRow | undefined) =>
  draft?.status === "ready" || draft?.status === "failed" || draft?.status === "approved";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function Triage({
  initialItems,
  initialDrafts,
  markdown,
}: {
  initialItems: ReadingItem[];
  initialDrafts: DistillDraftRow[];
  markdown: Record<string, string>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [drafts, setDrafts] = useState<Record<string, DistillDraftRow>>(() =>
    Object.fromEntries(initialDrafts.map((draft) => [draft.extract_id, draft])),
  );
  const [edits, setEdits] = useState<Record<string, NoteEdit>>({});
  const [dropped, setDropped] = useState<Record<string, ReadonlySet<number>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const driving = useRef(new Set<string>());

  const current = items[0];

  // One model call per POST, so keep posting until the draft settles. Another
  // tab may hold the claim; then the POST is just a read, and we wait.
  const drive = useCallback(async (extractId: string, retry = false) => {
    if (driving.current.has(extractId)) return;
    driving.current.add(extractId);
    try {
      for (let step = 0; step < MAX_DRIVE_STEPS; step++) {
        const response = await fetch(
          `/api/distill/extract/${extractId}${retry && step === 0 ? "?retry=1" : ""}`,
          { method: "POST" },
        );
        if (!response.ok) return;
        const body = await readJson<{ draft?: DistillDraftRow }>(response, "");
        if (!body.draft) return;
        const draft = body.draft;
        setDrafts((known) => ({ ...known, [extractId]: draft }));
        if (settled(draft)) return;
        if (draft.status === "drafting_note" || draft.status === "drafting_cards") {
          await sleep(POLL_MS);
        }
      }
    } catch {
      // The card shows "still drafting" and offers a retry; nothing to add here.
    } finally {
      driving.current.delete(extractId);
    }
  }, []);

  const upcoming = items
    .slice(0, PREFETCH)
    .filter((item) => !settled(drafts[item.id]))
    .map((item) => item.id)
    .join(",");
  useEffect(() => {
    // Sequential, nearest first: the passage on screen should not queue behind
    // the ones after it for the model's attention.
    let cancelled = false;
    void (async () => {
      for (const id of upcoming ? upcoming.split(",") : []) {
        if (cancelled) return;
        await drive(id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [upcoming, drive]);

  const refreshBadge = useCallback(() => {
    // The nav count is server-rendered.
    startTransition(() => router.refresh());
  }, [router]);

  const act = useCallback(
    async (item: ReadingItem, body: { action?: ReadingAction; priority?: number }) => {
      setBusy(true);
      setError(undefined);
      try {
        const response = await fetch(`/api/extracts/${item.id}`, {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        });
        const result = await readJson<{ extract?: ExtractRow; error?: string }>(
          response,
          "Could not update the passage.",
        );
        if (!response.ok || !result.extract) {
          throw new Error(result.error || "Could not update the passage.");
        }
        const updated = result.extract;
        setItems((queue) =>
          body.action
            ? queue.filter(({ id }) => id !== item.id)
            : queue.map((row) =>
                row.id === item.id ? { ...row, priority: updated.priority } : row,
              ),
        );
        if (body.action) refreshBadge();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not update the passage.");
      } finally {
        setBusy(false);
      }
    },
    [refreshBadge],
  );

  const approve = useCallback(
    async (item: ReadingItem, note: NoteEdit, activities: ActivityPayload[]) => {
      setBusy(true);
      setError(undefined);
      try {
        const response = await fetch(`/api/distill/extract/${item.id}/approve`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...note, activities }),
        });
        const result = await readJson<{ error?: string; issues?: { message: string }[] }>(
          response,
          "Could not approve the draft.",
        );
        if (!response.ok) {
          throw new Error(result.issues?.[0]?.message || result.error || "Could not approve the draft.");
        }
        setItems((queue) => queue.filter(({ id }) => id !== item.id));
        refreshBadge();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Could not approve the draft.");
      } finally {
        setBusy(false);
      }
    },
    [refreshBadge],
  );

  if (!current) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Nothing to read right now</EmptyTitle>
          <EmptyDescription>
            Passages come back here on growing intervals. Add a source in the
            Library and its key passages will be waiting here, already drafted
            into a note and cards for you to approve.{" "}
            {/* A full reload, not a refresh: the queue here is local state. */}
            <button
              type="button"
              className="underline underline-offset-4"
              onClick={() => window.location.reload()}
            >
              Check again
            </button>
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3">
      <p className="text-sm text-muted-foreground" aria-live="polite">
        {items.length} left this session
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <TriageCard
        // Remount per passage: editor content, focus, and scroll all start over.
        key={current.id}
        item={current}
        markdown={markdown[current.source_id ?? ""]}
        draft={drafts[current.id]}
        edit={edits[current.id]}
        dropped={dropped[current.id]}
        busy={busy}
        onEdit={(edit) => setEdits((all) => ({ ...all, [current.id]: edit }))}
        onToggleCard={(index, keep) =>
          setDropped((all) => {
            const next = new Set(all[current.id]);
            if (keep) next.delete(index);
            else next.add(index);
            return { ...all, [current.id]: next };
          })
        }
        onApprove={(note, activities) => void approve(current, note, activities)}
        onAction={(action) => void act(current, { action })}
        onPriority={(delta) => {
          const priority = Math.min(100, Math.max(0, current.priority + delta * PRIORITY_STEP));
          if (priority !== current.priority) void act(current, { priority });
        }}
        onRetry={() => void drive(current.id, true)}
      />
    </div>
  );
}
