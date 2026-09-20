"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { buildSelector, isAnchorableRange, resolveExact } from "@/lib/anchor/selector";
import { readJson } from "@/lib/client/json";
import type { ExtractProposal, SelectorBundle } from "@/lib/contracts";
import type { ActivityPayload } from "@/lib/contracts/activity";
import type { ExtractRow, NoteRow } from "@/lib/store/types";
import { NoteEditor } from "./note-editor";
import { SourcePane, type PaintedExtract } from "./source-pane";

type ResolvedProposal = ExtractProposal & {
  id: string;
  selector: SelectorBundle;
  state: "pending" | "saving" | "accepted" | "rejected" | "error";
  message?: string;
};

type ReaderShellProps = {
  source: { id: string; title: string; markdown: string };
  initialExtracts: ExtractRow[];
  initialNote: NoteRow | null;
  /** When the source is a PDF, link to the archived original in a new tab. */
  pdfFileUrl?: string;
};

type SourceSelection = { start: number; end: number };

function activityPrompt(activity: ActivityPayload): string {
  return activity.type === "fill_blank" ? activity.template : activity.stem;
}

export function ReaderShell({ source, initialExtracts, initialNote, pdfFileUrl }: ReaderShellProps) {
  const [extracts, setExtracts] = useState(initialExtracts);
  const [proposals, setProposals] = useState<ResolvedProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoMode, setAutoMode] = useState(false);
  const [status, setStatus] = useState<string>();
  const [note, setNote] = useState(initialNote);
  const [noteTitle, setNoteTitle] = useState(initialNote?.title ?? "");
  const [noteBody, setNoteBody] = useState(initialNote?.body_md ?? "");
  const [noteStatus, setNoteStatus] = useState<string>();
  const [savingNote, setSavingNote] = useState(false);
  const [activityDrafts, setActivityDrafts] = useState<ActivityPayload[]>([]);
  const [selectedActivities, setSelectedActivities] = useState<Set<number>>(new Set());
  const [activityStatus, setActivityStatus] = useState<string>();
  const [generatingActivities, setGeneratingActivities] = useState(false);
  const [acceptingActivities, setAcceptingActivities] = useState(false);
  const [selection, setSelection] = useState<SourceSelection | null>(null);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number } | null>(null);
  const [manualStatus, setManualStatus] = useState<string>();

  const paintedExtracts = useMemo<PaintedExtract[]>(
    () =>
      extracts.map((extract) => ({
        id: extract.id,
        start: extract.selector.start,
        end: extract.selector.end,
        orphaned: extract.anchor_status === "orphaned",
      })),
    [extracts],
  );
  const paintedProposals = proposals
    .filter((proposal) => proposal.state === "pending" || proposal.state === "saving")
    .map((proposal) => ({
      id: proposal.id,
      start: proposal.selector.start,
      end: proposal.selector.end,
    }));

  const createHumanExtract = useCallback(async (range: SourceSelection) => {
    if (!isAnchorableRange(range.start, range.end)) {
      throw new Error("Select at least 10 characters for an extract.");
    }
    const selector = buildSelector(source.markdown, range.start, range.end);
    const response = await fetch("/api/extracts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        source_id: source.id,
        body_md: selector.exact,
        priority: 50,
        selector,
        suggested_by: "human",
      }),
    });
    const body = await readJson<{
      extract?: ExtractRow;
      duplicate?: boolean;
      error?: string;
    }>(response, "Could not create extract.");
    if (!response.ok || !body.extract) throw new Error(body.error || "Could not create extract.");
    setExtracts((current) =>
      current.some(({ id }) => id === body.extract!.id) ? current : [...current, body.extract!],
    );
    return { extract: body.extract, duplicate: body.duplicate === true };
  }, [source.id, source.markdown]);

  const extractSelection = useCallback(async () => {
    if (!selection) return;
    setSelectionMenu(null);
    try {
      const result = await createHumanExtract(selection);
      setManualStatus(result.duplicate ? "That extract already exists." : "Extract created.");
    } catch (error) {
      setManualStatus(error instanceof Error ? error.message : "Could not create extract.");
    }
  }, [createHumanExtract, selection]);

  const clozeSelection = useCallback(async () => {
    if (!selection) return;
    setSelectionMenu(null);
    try {
      const containing = extracts.find(
        (extract) =>
          extract.selector.start <= selection.start && extract.selector.end >= selection.end,
      );
      const parent = containing ?? (await createHumanExtract(selection)).extract;
      const start = containing ? selection.start - parent.selector.start : 0;
      const end = containing ? selection.end - parent.selector.start : parent.body_md.length;
      const response = await fetch("/api/activities/cloze", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ extract_id: parent.id, start, end }),
      });
      const body = await readJson<{ duplicate?: boolean; error?: string }>(
        response,
        "Could not create cloze.",
      );
      if (!response.ok) throw new Error(body.error || "Could not create cloze.");
      setManualStatus(body.duplicate ? "That cloze already exists." : "Cloze added to review.");
    } catch (error) {
      setManualStatus(error instanceof Error ? error.message : "Could not create cloze.");
    }
  }, [createHumanExtract, extracts, selection]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.altKey || event.ctrlKey || event.metaKey) return;
      if (event.code === "KeyX" && selection) {
        event.preventDefault();
        void extractSelection();
      } else if (event.code === "KeyZ" && selection) {
        event.preventDefault();
        void clozeSelection();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [clozeSelection, extractSelection, selection]);

  async function requestProposals(): Promise<ResolvedProposal[]> {
    setLoading(true);
    setStatus(undefined);
    try {
      const response = await fetch("/api/ai/extracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sourceId: source.id }),
      });
      const body = await readJson<ExtractProposal[] | { error?: string; detail?: string }>(
        response,
        "Could not generate proposals.",
      );
      if (!response.ok || !Array.isArray(body)) {
        throw new Error(!Array.isArray(body) ? body.detail || body.error : "Proposal request failed.");
      }

      const accepted = new Set(extracts.map((extract) => extract.body_md));
      let unresolved = 0;
      const resolved = body.flatMap((proposal) => {
        if (accepted.has(proposal.exact)) return [];
        const selector = resolveExact(source.markdown, proposal.exact);
        if (!selector) {
          unresolved++;
          return [];
        }
        return [{ ...proposal, id: crypto.randomUUID(), selector, state: "pending" as const }];
      });
      setProposals(resolved);
      setStatus(
        `${resolved.length} proposal${resolved.length === 1 ? "" : "s"} ready${unresolved ? `; ${unresolved} could not be anchored` : ""}.`,
      );
      return resolved;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not generate proposals.");
      return [];
    } finally {
      setLoading(false);
    }
  }

  async function suggest() {
    await requestProposals();
  }

  function updateProposal(id: string, patch: Partial<ResolvedProposal>) {
    setProposals((current) =>
      current.map((proposal) => (proposal.id === id ? { ...proposal, ...patch } : proposal)),
    );
  }

  async function accept(proposal: ResolvedProposal): Promise<"created" | "duplicate" | "failed"> {
    updateProposal(proposal.id, { state: "saving", message: undefined });
    try {
      const response = await fetch("/api/extracts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          source_id: source.id,
          body_md: proposal.exact,
          priority: proposal.priority,
          selector: proposal.selector,
          suggested_by: "nemotron",
          reason: proposal.reason,
          concepts: proposal.concepts,
        }),
      });
      const body = await readJson<{
        extract?: ExtractRow;
        duplicate?: boolean;
        error?: string;
      }>(response, "Could not save extract.");
      if (!response.ok || !body.extract) throw new Error(body.error || "Could not save extract.");
      setExtracts((current) =>
        current.some((extract) => extract.id === body.extract!.id)
          ? current
          : [...current, body.extract!],
      );
      updateProposal(proposal.id, {
        state: "accepted",
        message: body.duplicate ? "Already accepted." : "Accepted.",
      });
      return body.duplicate ? "duplicate" : "created";
    } catch (error) {
      updateProposal(proposal.id, {
        state: "error",
        message: error instanceof Error ? error.message : "Could not save extract.",
      });
      return "failed";
    }
  }

  function reject(id: string) {
    updateProposal(id, { state: "rejected", message: "Dismissed." });
  }

  async function runAuto() {
    if (
      !window.confirm(
        "Generate Nemotron proposals and automatically accept every valid, nonduplicate passage for this source? This may make a billable AI request.",
      )
    ) {
      return;
    }
    setAutoMode(true);
    const generated = await requestProposals();
    let created = 0;
    let duplicates = 0;
    let failed = 0;
    for (const proposal of generated) {
      const outcome = await accept(proposal);
      if (outcome === "created") created++;
      else if (outcome === "duplicate") duplicates++;
      else failed++;
    }
    setStatus(
      `Auto complete: ${created} created, ${duplicates} duplicate${duplicates === 1 ? "" : "s"}, ${failed} failed.`,
    );
    setAutoMode(false);
  }

  async function saveNote(): Promise<NoteRow | null> {
    if (!note) return null;
    setSavingNote(true);
    setNoteStatus(undefined);
    try {
      const response = await fetch(`/api/notes/${note.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: noteTitle, body_md: noteBody }),
      });
      const body = await readJson<NoteRow | { error?: string }>(response, "Could not save note.");
      if (!response.ok || !("id" in body)) {
        throw new Error("error" in body ? body.error : "Could not save note.");
      }
      setNote(body);
      setNoteTitle(body.title);
      setNoteBody(body.body_md);
      setActivityDrafts([]);
      setSelectedActivities(new Set());
      setNoteStatus("Saved. Existing activities derived from the older body may now be stale.");
      return body;
    } catch (error) {
      setNoteStatus(error instanceof Error ? error.message : "Could not save note.");
      return null;
    } finally {
      setSavingNote(false);
    }
  }

  async function generateActivityDrafts() {
    if (!note) return;
    let currentNote = note;
    if (noteTitle !== note.title || noteBody !== note.body_md) {
      const saved = await saveNote();
      if (!saved) return;
      currentNote = saved;
    }
    setGeneratingActivities(true);
    setActivityStatus(undefined);
    try {
      const response = await fetch("/api/ai/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          noteId: currentNote.id,
          types: ["mcq", "select_all", "fill_blank", "closed"],
          count: 4,
        }),
      });
      const body = await readJson<{
        activities?: ActivityPayload[];
        error?: string;
        detail?: string;
      }>(response, "Could not generate activities.");
      if (!response.ok || !body.activities) {
        throw new Error(body.detail || body.error || "Could not generate activities.");
      }
      setActivityDrafts(body.activities);
      setSelectedActivities(new Set(body.activities.map((_, index) => index)));
      setActivityStatus(`${body.activities.length} drafts ready. Select the ones to keep.`);
    } catch (error) {
      setActivityStatus(error instanceof Error ? error.message : "Could not generate activities.");
    } finally {
      setGeneratingActivities(false);
    }
  }

  function toggleActivity(index: number, checked: boolean) {
    setSelectedActivities((current) => {
      const next = new Set(current);
      if (checked) next.add(index);
      else next.delete(index);
      return next;
    });
  }

  async function acceptActivityDrafts() {
    if (!note) return;
    const chosen = activityDrafts.filter((_, index) => selectedActivities.has(index));
    if (!chosen.length) return;
    setAcceptingActivities(true);
    setActivityStatus(undefined);
    try {
      const response = await fetch("/api/ai/activities/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          note_id: note.id,
          source_body_hash: note.body_hash,
          activities: chosen,
        }),
      });
      const body = await readJson<{ activities?: unknown[]; error?: string }>(
        response,
        "Could not accept activities.",
      );
      if (!response.ok || !body.activities) {
        throw new Error(body.error || "Could not accept activities.");
      }
      setActivityDrafts([]);
      setSelectedActivities(new Set());
      setActivityStatus(`${body.activities.length} activities added to the review queue.`);
    } catch (error) {
      setActivityStatus(error instanceof Error ? error.message : "Could not accept activities.");
    } finally {
      setAcceptingActivities(false);
    }
  }

  function dismissActivityDrafts() {
    setActivityDrafts([]);
    setSelectedActivities(new Set());
    setActivityStatus("Drafts cleared.");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:h-full lg:flex-row">
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto px-4 pb-8 sm:px-6 lg:px-10 max-lg:max-h-[45svh] max-lg:shrink-0 lg:max-h-none">
        <div className="mx-auto mt-6 max-w-2xl">
          {pdfFileUrl ? (
            <p className="mb-4 text-sm">
              <a
                href={pdfFileUrl}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-primary underline-offset-4 hover:underline"
              >
                Open original PDF in a new tab
              </a>
            </p>
          ) : null}
          <SourcePane
            markdown={source.markdown}
            extracts={paintedExtracts}
            proposals={paintedProposals}
            onSelectionChange={(next) => {
              setSelection(next);
              if (!next) setSelectionMenu(null);
            }}
            onSelectionMenu={setSelectionMenu}
          />
          {manualStatus ? (
            <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
              {manualStatus}
            </p>
          ) : null}
          {selection ? (
            <div className="sticky bottom-3 z-20 mt-4 flex gap-2 rounded-xl border bg-background/95 p-2 shadow-lg backdrop-blur lg:hidden">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => void extractSelection()}>
                Extract
              </Button>
              <Button size="sm" className="flex-1" onClick={() => void clozeSelection()}>
                Cloze
              </Button>
            </div>
          ) : null}
          {selectionMenu ? (
            <div
              className="fixed z-50 min-w-44 rounded-lg border bg-popover p-1 text-popover-foreground shadow-md"
              style={{ left: selectionMenu.x, top: selectionMenu.y }}
              role="menu"
            >
              <button className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent" onClick={() => void extractSelection()}>
                Create extract <span className="ml-auto pl-4 text-muted-foreground">Alt+X</span>
              </button>
              <button className="flex w-full rounded-sm px-2 py-1.5 text-sm hover:bg-accent" onClick={() => void clozeSelection()}>
                Create cloze <span className="ml-auto pl-4 text-muted-foreground">Alt+Z</span>
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <aside className="flex min-h-0 min-w-0 w-full flex-1 shrink-0 flex-col overflow-y-auto overscroll-y-contain border-t bg-sidebar px-4 py-5 sm:px-5 sm:py-6 max-h-[min(40svh,24rem)] lg:max-h-none lg:h-full lg:w-80 lg:flex-none lg:shrink-0 lg:border-t-0 lg:border-l xl:w-[28rem]">
        {note && (
          <section className="mb-8 border-b pb-8">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="font-heading text-lg">Study note</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Activities are generated from this editable markdown, not the source.
                </p>
              </div>
              <Button variant="outline" onClick={() => void saveNote()} disabled={savingNote}>
                {savingNote ? "Saving…" : "Save"}
              </Button>
            </div>
            <Input
              className="mt-4"
              aria-label="Note title"
              value={noteTitle}
              onChange={(event) => setNoteTitle(event.target.value)}
            />
            <div className="mt-3">
              <NoteEditor body={noteBody} onBodyChange={setNoteBody} disabled={savingNote} />
            </div>
            {noteStatus && <p className="mt-2 text-xs text-muted-foreground">{noteStatus}</p>}
            <div className="mt-5 flex items-center justify-between gap-3">
              <div>
                <h3 className="font-heading text-base">Nemotron activities</h3>
                <p className="text-xs text-muted-foreground">Four formats, previewed before persistence.</p>
              </div>
              <Button onClick={() => void generateActivityDrafts()} disabled={generatingActivities || savingNote}>
                {generatingActivities ? "Thinking…" : activityDrafts.length ? "Regenerate" : "Generate"}
              </Button>
            </div>
            {activityStatus && <p className="mt-3 text-xs text-muted-foreground">{activityStatus}</p>}
            <ul className="mt-4 space-y-3">
              {activityDrafts.map((activity, index) => (
                <li key={`${activity.type}-${index}`} className="rounded-lg border bg-card p-3 text-sm">
                  <label className="flex cursor-pointer items-start gap-3">
                    <Checkbox
                      checked={selectedActivities.has(index)}
                      onCheckedChange={(checked) => toggleActivity(index, checked === true)}
                      aria-label={`Select ${activity.type} activity`}
                    />
                    <span className="min-w-0">
                      <Badge variant="outline">{activity.type.replace("_", " ")}</Badge>
                      <span className="mt-2 block font-medium">{activityPrompt(activity)}</span>
                      {activity.type === "mcq" && (
                        <span className="mt-2 block text-xs text-muted-foreground">
                          {activity.options.map((option, optionIndex) => `${optionIndex + 1}. ${option}`).join(" · ")}
                        </span>
                      )}
                      {activity.type === "select_all" && (
                        <span className="mt-2 block text-xs text-muted-foreground">{activity.options.join(" · ")}</span>
                      )}
                      {activity.type === "closed" && (
                        <span className="mt-2 block text-xs text-muted-foreground">Answer: {activity.answer}</span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
            {activityDrafts.length > 0 && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button
                  className="flex-1"
                  onClick={() => void acceptActivityDrafts()}
                  disabled={acceptingActivities || selectedActivities.size === 0}
                >
                  {acceptingActivities
                    ? "Adding…"
                    : `Add ${selectedActivities.size} to review`}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={dismissActivityDrafts}
                  disabled={acceptingActivities}
                >
                  Reject all
                </Button>
              </div>
            )}
          </section>
        )}
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-heading text-lg">Nemotron extracts</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Review verbatim passages before adding them to this source.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => void runAuto()} disabled={loading || autoMode}>
              {autoMode ? "Auto…" : "Auto"}
            </Button>
            <Button onClick={() => void suggest()} disabled={loading || autoMode}>
              {loading ? "Thinking…" : "Suggest"}
            </Button>
          </div>
        </div>
        {status && <p className="mt-3 text-xs text-muted-foreground">{status}</p>}
        <ul className="mt-5 space-y-3">
          {proposals.map((proposal) => (
            <li key={proposal.id} className="rounded-lg border bg-card p-3 text-sm">
              <div className="mb-2 flex flex-wrap items-center gap-1">
                <Badge variant="outline">priority {proposal.priority}</Badge>
                {proposal.concepts.map((concept) => (
                  <Badge key={concept} variant="secondary">{concept}</Badge>
                ))}
              </div>
              <p className="font-serif">{proposal.exact}</p>
              <p className="mt-2 text-muted-foreground">{proposal.reason}</p>
              {proposal.message && <p className="mt-2 text-xs">{proposal.message}</p>}
              {(proposal.state === "pending" || proposal.state === "error") && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => void accept(proposal)}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => reject(proposal.id)}>
                    Reject
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}