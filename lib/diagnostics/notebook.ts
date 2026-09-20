import { dbConfigured, query } from "@/lib/db";
import { seedReviewDaily } from "@/lib/seed";
import {
  listConceptExtracts,
  listConceptNotes,
  listConcepts,
} from "@/lib/store/concepts";
import { listNotebookItems } from "@/lib/store/notebooks";
import type { ReviewEventRow } from "@/lib/store/types";
import { listActivities, listReviewEventsSince } from "@/lib/store/review";

const WINDOW_DAYS = 90;
/**
 * How far back the Struggling/Known call looks.
 *
 * The trend sparkline still covers the full 90 days, but judging a bucket on
 * all of it means a concept with months of history cannot move: three failed
 * reviews against 185 past ones shift the rate by a percent and the pie sits
 * still, which reads as "reviewing does nothing". Two weeks is short enough
 * that today's answers visibly count and long enough not to flip a bucket on a
 * single unlucky card.
 */
const RECENT_DAYS = 14;
const STRUGGLING_RECALL_RATE = 0.72;
const STRUGGLING_STABILITY = 2.5;

export type NotebookConceptDiagnostic = {
  id: string;
  concept: string;
  reviews: number;
  recalled: number;
  recallRate: number | null;
  avgStability: number | null;
  why: string | null;
};

export type NotebookDiagnostics = {
  notebookId: string;
  windowDays: number;
  source: "review_daily" | "fixture_rollup";
  struggling: NotebookConceptDiagnostic[];
  known: NotebookConceptDiagnostic[];
  untouched: NotebookConceptDiagnostic[];
  trend: number[];
  nextAction: string;
};

type DailyRow = {
  bucket: string;
  concept_id: string;
  reviews: number;
  recalled: number;
  avg_stability: number;
};

async function scope(notebookId: string) {
  const [items, activities, concepts, relations, extractRelations] =
    await Promise.all([
      listNotebookItems(notebookId),
      listActivities(),
      listConcepts(),
      listConceptNotes(),
      listConceptExtracts(),
    ]);
  const noteIds = new Set(
    items.filter((item) => item.item_type === "note").map((item) => item.item_id),
  );
  const directActivityIds = new Set(
    items
      .filter((item) => item.item_type === "activity")
      .map((item) => item.item_id),
  );
  const extractIds = new Set(
    items
      .filter((item) => item.item_type === "extract")
      .map((item) => item.item_id),
  );
  for (const activity of activities) {
    if (!directActivityIds.has(activity.id)) continue;
    if (activity.note_id) noteIds.add(activity.note_id);
    if (activity.extract_id) extractIds.add(activity.extract_id);
  }
  const conceptIds = new Set([
    ...relations
      .filter((relation) => noteIds.has(relation.note_id))
      .map((relation) => relation.concept_id),
    ...extractRelations
      .filter((relation) => extractIds.has(relation.extract_id))
      .map((relation) => relation.concept_id),
  ]);
  return concepts.filter((concept) => conceptIds.has(concept.id));
}

/** Midnight UTC today, the boundary `review_daily` buckets are cut on. */
function startOfTodayIso(): string {
  return `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`;
}

/**
 * Settled days out of the rollup, today onward straight off `review_event`.
 *
 * `review_daily` is a continuous aggregate refreshed hourly with a one-hour
 * end offset, so on its own it lags a rating by up to two hours — long enough
 * that a review never visibly moves these buckets. Reading everything before
 * today from the rollup and today onward live keeps the Tiger aggregate doing
 * the heavy 90-day work while a rating lands on the pie immediately, with no
 * day counted twice. Skipping the demo clock forward records events dated in
 * the future, which are past the cutoff and so are live rows too.
 */
async function dailyRows(conceptIds: string[]): Promise<DailyRow[]> {
  if (conceptIds.length === 0) return [];
  const cutoff = startOfTodayIso();
  const [settled, live] = await Promise.all([
    settledRows(conceptIds, cutoff),
    listReviewEventsSince(cutoff, conceptIds),
  ]);
  return [...settled, ...rollup(live)];
}

async function settledRows(
  conceptIds: string[],
  cutoff: string,
): Promise<DailyRow[]> {
  if (dbConfigured()) {
    // The cutoff is passed as a timestamptz rather than a date so the boundary
    // is UTC midnight on both sides of the union whatever the session timezone
    // is; `time_bucket` on a timestamptz already cuts days on UTC.
    const rows = await query(
      `select bucket, concept_id, reviews, recalled, avg_stability
       from review_daily
       where concept_id = any($1::uuid[])
         and bucket >= date_trunc('day', now()) - interval '89 days'
         and bucket < $2::timestamptz
       order by bucket`,
      [conceptIds, cutoff],
    );
    return rows.map((row) => ({
      bucket: row.bucket instanceof Date
        ? row.bucket.toISOString().slice(0, 10)
        : String(row.bucket).slice(0, 10),
      concept_id: String(row.concept_id),
      reviews: Number(row.reviews),
      recalled: Number(row.recalled),
      avg_stability: Number(row.avg_stability),
    }));
  }
  const cutoffDay = cutoff.slice(0, 10);
  const wanted = new Set(conceptIds);
  return seedReviewDaily.filter(
    (row) => wanted.has(row.concept_id) && row.bucket < cutoffDay,
  );
}

/** Same shape the continuous aggregate produces, one bucket per UTC day. */
function rollup(events: ReviewEventRow[]): DailyRow[] {
  const buckets = new Map<string, DailyRow>();
  for (const event of events) {
    if (!event.concept_id) continue;
    const bucket = event.time.slice(0, 10);
    const key = `${bucket}|${event.concept_id}`;
    const row = buckets.get(key) ?? {
      bucket,
      concept_id: event.concept_id,
      reviews: 0,
      recalled: 0,
      avg_stability: 0,
    };
    // avg_stability is held as a running total and divided out at the end.
    row.avg_stability += event.stability;
    row.reviews += 1;
    if (event.rating >= 2) row.recalled += 1;
    buckets.set(key, row);
  }
  return [...buckets.values()].map((row) => ({
    ...row,
    avg_stability: row.avg_stability / row.reviews,
  }));
}

function dayKeys(rows: DailyRow[]): string[] {
  const latest = rows.reduce(
    (max, row) => Math.max(max, Date.parse(`${row.bucket}T00:00:00Z`)),
    Number.NEGATIVE_INFINITY,
  );
  const end = Number.isFinite(latest)
    ? latest
    : Date.now();
  return Array.from({ length: WINDOW_DAYS }, (_, index) =>
    new Date(end - (WINDOW_DAYS - 1 - index) * 86_400_000)
      .toISOString()
      .slice(0, 10),
  );
}

type ConceptTotals = {
  reviews: number;
  recalled: number;
  stabilityTotal: number;
};

function totalsByConcept(rows: DailyRow[]): Map<string, ConceptTotals> {
  const totals = new Map<string, ConceptTotals>();
  for (const row of rows) {
    const total = totals.get(row.concept_id) ?? {
      reviews: 0,
      recalled: 0,
      stabilityTotal: 0,
    };
    total.reviews += row.reviews;
    total.recalled += row.recalled;
    total.stabilityTotal += row.avg_stability * row.reviews;
    totals.set(row.concept_id, total);
  }
  return totals;
}

export async function diagnosticsForNotebook(
  notebookId: string,
): Promise<NotebookDiagnostics> {
  const concepts = await scope(notebookId);
  const rows = await dailyRows(concepts.map((concept) => concept.id));
  const keys = dayKeys(rows);
  const recentFrom = keys[WINDOW_DAYS - RECENT_DAYS];
  const lifetime = totalsByConcept(rows);
  const recent = totalsByConcept(
    rows.filter((row) => row.bucket >= recentFrom),
  );

  const struggling: NotebookConceptDiagnostic[] = [];
  const known: NotebookConceptDiagnostic[] = [];
  const untouched: NotebookConceptDiagnostic[] = [];
  for (const concept of concepts) {
    // Fall back to the full window for a concept nobody has touched lately,
    // so quiet concepts keep the bucket they earned instead of dropping out.
    const windowDays = recent.get(concept.id)?.reviews ? RECENT_DAYS : WINDOW_DAYS;
    const total =
      windowDays === RECENT_DAYS ? recent.get(concept.id) : lifetime.get(concept.id);
    if (!total || total.reviews === 0) {
      untouched.push({
        id: concept.id,
        concept: concept.label,
        reviews: 0,
        recalled: 0,
        recallRate: null,
        avgStability: null,
        why: null,
      });
      continue;
    }
    const recallRate = total.recalled / total.reviews;
    const avgStability = total.stabilityTotal / total.reviews;
    const diagnostic: NotebookConceptDiagnostic = {
      id: concept.id,
      concept: concept.label,
      reviews: total.reviews,
      recalled: total.recalled,
      recallRate,
      avgStability,
      why:
        recallRate < STRUGGLING_RECALL_RATE
          ? `Recall rate ${(recallRate * 100).toFixed(0)}% over ${windowDays} days.`
          : avgStability < STRUGGLING_STABILITY
            ? `Stability still ${avgStability.toFixed(1)}.`
            : null,
    };
    (diagnostic.why ? struggling : known).push(diagnostic);
  }

  const index = new Map(keys.map((key, position) => [key, position]));
  const trend = Array.from({ length: WINDOW_DAYS }, () => 0);
  for (const row of rows) {
    const position = index.get(row.bucket);
    if (position !== undefined) trend[position] += row.reviews;
  }

  return {
    notebookId,
    windowDays: WINDOW_DAYS,
    source: dbConfigured() ? "review_daily" : "fixture_rollup",
    struggling,
    known,
    untouched,
    trend,
    nextAction: struggling[0]
      ? `Review ${struggling[0].concept} next — ${struggling[0].why}`
      : "Keep the daily queue moving.",
  };
}

export async function notebookTrends(
  notebookIds: string[],
): Promise<Record<string, number[]>> {
  const entries = await Promise.all(
    notebookIds.map(async (id) => [id, (await diagnosticsForNotebook(id)).trend] as const),
  );
  return Object.fromEntries(entries);
}
