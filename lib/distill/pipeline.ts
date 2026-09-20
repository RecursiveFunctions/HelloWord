/**
 * The auto-distill pipeline: the model does the distilling, the reader approves.
 *
 *   source ready -> proposals (pending extracts, in the reading queue)
 *   reader reaches one -> drafted note -> drafted cards
 *   reader approves -> real note, `extract_note`, real activities
 *
 * Nothing is a real note or a reviewable activity until `approveDraft`. That is
 * the line PLAN.md draws with "the note is the pivot", moved from "a human
 * edits" to "a human approves": the draft is editable on the way through, and
 * a reader who changes nothing has still read it and said yes.
 *
 * Every function makes at most ONE model call. `chatJson` may spend 45 seconds
 * and a route has 60, so two calls cannot share a request. The stages are
 * driven from outside instead - ingest's `after()`, then the triage screen -
 * and each leaves a status behind so the next caller knows where to resume.
 */
import { generateActivities } from "@/lib/ai/activities";
import { proposeExtracts } from "@/lib/ai/extracts";
import { draftNote } from "@/lib/ai/note";
import { describeError } from "@/lib/ai/provider";
import { resolveExact } from "@/lib/anchor/selector";
import type { ActivityPayload, ActivityType } from "@/lib/contracts/activity";
import { hashBody } from "@/lib/hash";
import {
  claimDraft,
  ensureDraft,
  getDraft,
  moveDraft,
  updateDraft,
} from "@/lib/store/distill";
import {
  createProposedExtract,
  getExtractAny,
  listSourceExtracts,
  listSourceExtractsAny,
  patchExtract,
} from "@/lib/store/extracts";
import { addNotebookItems, listNotebookItems, listNotebooks } from "@/lib/store/notebooks";
import { createNote, linkExtractNote } from "@/lib/store/notes";
import { createActivities } from "@/lib/store/review";
import { getSource, updateSource } from "@/lib/store/sources";
import type { ActivityRow, DistillDraftRow, NoteRow, SourceRow } from "@/lib/store/types";

/**
 * One extract is one idea, so a few cards cover it. No `select_all`: it needs
 * several true statements, and a single passage rarely holds that many.
 */
const CARD_TYPES: ActivityType[] = ["closed", "fill_blank", "mcq"];
const CARDS_PER_EXTRACT = 3;

export type DistillOptions = {
  /** Run even if the source was already distilled, or looks mid-run. */
  force?: boolean;
};

/**
 * Stage one. Idempotent: a passage the source already has at any status -
 * accepted, pending, or dismissed - is skipped, so re-running never resurrects
 * something the reader threw away. Never throws; failure is a status, because
 * the usual caller is `after()` and has nobody to throw to.
 */
export async function distillExtracts(
  sourceId: string,
  options: DistillOptions = {},
): Promise<SourceRow | null> {
  const source = await getSource(sourceId);
  if (!source) return null;
  if (source.ingest_status !== "ready" || !source.markdown) return source;
  if (!options.force && (source.distill_status === "proposed" || source.distill_status === "extracting")) {
    return source;
  }

  await updateSource(sourceId, { distill_status: "extracting", distill_error: null });

  try {
    // `getSource`, not `lib/ai/data` `loadSource`: that one reads the seed in
    // memory mode and has never heard of a source ingested this session.
    const { proposals } = await proposeExtracts({
      id: source.id,
      title: source.title,
      markdown: source.markdown,
    });

    const known = new Set((await listSourceExtractsAny(sourceId)).map((e) => e.body_md));
    for (const proposal of proposals) {
      if (known.has(proposal.exact)) continue;
      const selector = resolveExact(source.markdown, proposal.exact);
      if (!selector) continue;
      known.add(proposal.exact);
      const extract = await createProposedExtract({
        source_id: sourceId,
        body_md: selector.exact,
        priority: proposal.priority,
        selector,
        reason: proposal.reason,
        concepts: proposal.concepts,
      });
      await ensureDraft(extract.id);
    }

    return await updateSource(sourceId, { distill_status: "proposed", distill_error: null });
  } catch (error) {
    return await updateSource(sourceId, {
      distill_status: "failed",
      distill_error: describeError(error).slice(0, 500),
    });
  }
}

/**
 * Stages two and three, one per call. Safe to call repeatedly and from several
 * tabs: the claim is atomic, and a caller who loses it just gets the row back
 * in whatever state the winner has it.
 */
export async function advanceDraft(extractId: string): Promise<DistillDraftRow | null> {
  const extract = await getExtractAny(extractId);
  if (!extract) return null;
  const draft = await ensureDraft(extractId);

  if (draft.status === "pending" || draft.status === "drafting_note") {
    const claimed = await claimDraft(extractId, "pending", "drafting_note");
    if (!claimed) return getDraft(extractId);
    try {
      const source = extract.source_id ? await getSource(extract.source_id) : null;
      const { draft: note } = await draftNote([
        {
          id: extract.id,
          body_md: extract.body_md,
          priority: extract.priority,
          parent_title: source?.title ?? "Untitled",
        },
      ]);
      return await updateDraft(extractId, {
        status: "note_ready",
        note_title: note.title,
        note_body_md: note.body_md,
        note_concepts: note.concepts,
      });
    } catch (error) {
      return await updateDraft(extractId, {
        status: "failed",
        error: describeError(error).slice(0, 500),
      });
    }
  }

  if (draft.status === "note_ready" || draft.status === "drafting_cards") {
    const claimed = await claimDraft(extractId, "note_ready", "drafting_cards");
    if (!claimed) return getDraft(extractId);
    try {
      const body = claimed.note_body_md ?? "";
      const { batch } = await generateActivities(
        // Not a stored note yet, so it borrows the extract's id. Only the body
        // reaches the model.
        {
          id: extractId,
          title: claimed.note_title ?? "Untitled",
          body_md: body,
          body_hash: hashBody(body),
        },
        CARD_TYPES,
        CARDS_PER_EXTRACT,
      );
      return await updateDraft(extractId, { status: "ready", activities: batch.activities });
    } catch (error) {
      return await updateDraft(extractId, {
        status: "failed",
        error: describeError(error).slice(0, 500),
      });
    }
  }

  return draft;
}

/** `failed` back to wherever it can resume from: a drafted note is kept. */
export async function retryDraft(extractId: string): Promise<DistillDraftRow | null> {
  const draft = await getDraft(extractId);
  if (!draft || draft.status !== "failed") return draft;
  return updateDraft(extractId, {
    status: draft.note_body_md ? "note_ready" : "pending",
    error: null,
  });
}

export type ApproveInput = {
  title: string;
  body_md: string;
  activities: ActivityPayload[];
};

export type ApproveResult = {
  note: NoteRow;
  activities: ActivityRow[];
  extract_id: string;
};

export class DraftNotReadyError extends Error {}

/**
 * The human's yes. The only place a draft becomes a note and cards.
 *
 * Not one database transaction: the stores each own their connection. The order
 * is chosen so that an interruption leaves nothing reviewable that was not
 * approved - the note lands first, the cards last, and the draft is marked
 * `approved` only after both.
 */
export async function approveDraft(
  extractId: string,
  input: ApproveInput,
): Promise<ApproveResult | null> {
  const pending = await getExtractAny(extractId);
  if (!pending || !pending.source_id) return null;
  const draft = await getDraft(extractId);
  if (!draft || draft.status === "approved") {
    throw new DraftNotReadyError("This passage has no draft waiting for approval.");
  }

  // The reader may have extracted the same passage by hand since the proposal
  // was made. One accepted copy per source: theirs survives, and inherits this.
  let survivorId = extractId;
  if (!pending.accepted) {
    const twin = (await listSourceExtracts(pending.source_id)).find(
      (other) => other.body_md === pending.body_md,
    );
    if (twin) {
      await moveDraft(extractId, twin.id);
      await patchExtract(extractId, { queue_status: "dismissed" });
      survivorId = twin.id;
    }
  }

  const edited =
    input.title.trim() !== (draft.note_title ?? "").trim() ||
    input.body_md.trim() !== (draft.note_body_md ?? "").trim();
  const note = await createNote({
    title: input.title,
    body_md: input.body_md,
    origin: edited ? "ai_edited" : "ai_drafted",
  });
  await linkExtractNote(survivorId, note.id);

  // Wherever the source is filed, the note belongs too.
  for (const notebook of await listNotebooks()) {
    const items = await listNotebookItems(notebook.id);
    if (items.some((i) => i.item_type === "source" && i.item_id === pending.source_id)) {
      await addNotebookItems(notebook.id, [{ item_type: "note", item_id: note.id }]);
    }
  }

  // The hash of the body as saved, so an untouched note's cards are not stale.
  const activities = await createActivities(note.id, note.body_hash, input.activities);

  await patchExtract(survivorId, { accepted: true, queue_status: "distilled" });
  await updateDraft(survivorId, { status: "approved" });

  return { note, activities, extract_id: survivorId };
}
