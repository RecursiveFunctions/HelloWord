import { dbConfigured, query } from "@/lib/db";
import { seedReviewDaily } from "@/lib/seed";
import { listConceptNotes, listConcepts } from "@/lib/store/concepts";
import { listNotebookItems } from "@/lib/store/notebooks";
import { listActivities } from "@/lib/store/review";

const WINDOW_DAYS = 90;
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
  const [items, activities, concepts, relations] = await Promise.all([
    listNotebookItems(notebookId),
    listActivities(),
    listConcepts(),
    listConceptNotes(),
  ]);
  const noteIds = new Set(
    items.filter((item) => item.item_type === "note").map((item) => item.item_id),
  );
  const directActivityIds = new Set(
    items
      .filter((item) => item.item_type === "activity")
      .map((item) => item.item_id),
  );
  for (const activity of activities) {
    if (directActivityIds.has(activity.id)) noteIds.add(activity.note_id);
  }
  const conceptIds = new Set(
    relations
      .filter((relation) => noteIds.has(relation.note_id))
      .map((relation) => relation.concept_id),
  );
  return concepts.filter((concept) => conceptIds.has(concept.id));
}

async function dailyRows(conceptIds: string[]): Promise<DailyRow[]> {
  if (conceptIds.length === 0) return [];
  if (dbConfigured()) {
    const rows = await query(
      `select bucket, concept_id, reviews, recalled, avg_stability
       from review_daily
       where concept_id = any($1::uuid[])
         and bucket >= date_trunc('day', now()) - interval '89 days'
       order by bucket`,
      [conceptIds],
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
  const wanted = new Set(conceptIds);
  return seedReviewDaily.filter((row) => wanted.has(row.concept_id));
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

export async function diagnosticsForNotebook(
  notebookId: string,
): Promise<NotebookDiagnostics> {
  const concepts = await scope(notebookId);
  const rows = await dailyRows(concepts.map((concept) => concept.id));
  const totals = new Map<
    string,
    { reviews: number; recalled: number; stabilityTotal: number }
  >();
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

  const struggling: NotebookConceptDiagnostic[] = [];
  const known: NotebookConceptDiagnostic[] = [];
  const untouched: NotebookConceptDiagnostic[] = [];
  for (const concept of concepts) {
    const total = totals.get(concept.id);
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
          ? `Recall rate ${(recallRate * 100).toFixed(0)}% over 90 days.`
          : avgStability < STRUGGLING_STABILITY
            ? `Stability still ${avgStability.toFixed(1)}.`
            : null,
    };
    (diagnostic.why ? struggling : known).push(diagnostic);
  }

  const keys = dayKeys(rows);
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