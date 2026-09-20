/**
 * The incremental reading queue, above the store and below the routes.
 *
 * "Now" is the review clock, not the wall clock: skipping ahead in Review moves
 * the reading queue with it, and the Demo preset's one-second days apply here
 * too. That is one clock for the whole app rather than two that can disagree.
 */
import type { ReadingAction } from "@/lib/api";
import { reviewNow } from "@/lib/fsrs/engine";
import {
  getExtractAny,
  listReadingQueue,
  listSourceExtracts,
  patchExtract,
  readingCounts,
  type ExtractPatch,
  type ReadingCounts,
} from "@/lib/store/extracts";
import { getProfile } from "@/lib/store/review";
import { listSources } from "@/lib/store/sources";
import type { ExtractRow } from "@/lib/store/types";
import { nextReading } from "./schedule";

export type ReadingItem = ExtractRow & { source_title: string };

export type ReadingSnapshot = {
  items: ReadingItem[];
  counts: ReadingCounts;
  now: string;
};

export async function readingSnapshot(
  options: { limit?: number; includePending?: boolean } = {},
): Promise<ReadingSnapshot> {
  const now = reviewNow(await getProfile());
  const [extracts, counts, sources] = await Promise.all([
    listReadingQueue(now, options),
    readingCounts(now, options),
    listSources(),
  ]);
  const titles = new Map(sources.map((source) => [source.id, source.title]));
  return {
    items: extracts.map((extract) => ({
      ...extract,
      source_title: titles.get(extract.source_id ?? "") ?? "Unknown source",
    })),
    counts,
    now: now.toISOString(),
  };
}

export async function readingDueCount(): Promise<number> {
  const now = reviewNow(await getProfile());
  return (await readingCounts(now, { includePending: true })).due;
}

export async function applyReadingAction(
  id: string,
  input: { action?: ReadingAction; priority?: number },
): Promise<ExtractRow | null> {
  const extract = await getExtractAny(id);
  if (!extract) return null;

  const patch: ExtractPatch = {};
  if (input.priority !== undefined) patch.priority = input.priority;
  // A reprioritised passage should grow at its new rate from this showing on.
  const priority = input.priority ?? extract.priority;

  if (input.action === "next" || input.action === "postpone") {
    const profile = await getProfile();
    const now = reviewNow(profile);
    const outcome = nextReading(
      { interval_days: extract.queue_interval_days, reps: extract.queue_reps, priority },
      input.action,
      profile,
      now,
    );
    patch.queue_interval_days = outcome.interval_days;
    patch.queue_reps = outcome.reps;
    patch.queue_due = outcome.due;
    patch.queue_last_seen = now.toISOString();
    // Choosing to see a proposal again is accepting it.
    if (input.action === "next") patch.accepted = true;
  } else if (input.action === "keep") {
    patch.accepted = true;
  } else if (input.action === "dismiss") {
    patch.queue_status = "dismissed";
  } else if (input.action === "distill") {
    patch.queue_status = "distilled";
    patch.accepted = true;
  } else if (input.action === "requeue") {
    patch.queue_status = "queued";
    patch.queue_due = reviewNow(await getProfile()).toISOString();
  }

  // Accepting a proposal the reader has since extracted by hand would trip the
  // one-accepted-copy-per-source index. The hand-made one wins; the proposal
  // retires, and the action lands on the survivor.
  if (patch.accepted && !extract.accepted && extract.source_id) {
    const twin = (await listSourceExtracts(extract.source_id)).find(
      (other) => other.body_md === extract.body_md,
    );
    if (twin) {
      await patchExtract(id, { queue_status: "dismissed" });
      return patchExtract(twin.id, { ...patch, accepted: undefined });
    }
  }

  return patchExtract(id, patch);
}
