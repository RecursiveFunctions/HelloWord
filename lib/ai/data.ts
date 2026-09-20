import { dbConfigured, query } from "../db";
import {
  concepts,
  extractById,
  seedReviewDaily,
  sourceById,
  SEED_NOW,
} from "../seed";
import { getNote } from "../store/notes";

/**
 * Inputs for the AI routes, read from Tiger Cloud when DATABASE_URL is set and
 * from lib/seed otherwise — the same fallback db/README.md describes for the
 * screens. Nothing here writes: C proposes, B and D persist.
 */

export type AiSource = { id: string; title: string; markdown: string };
export type AiExtract = {
  id: string;
  body_md: string;
  priority: number;
  parent_title: string;
};
export type AiNote = {
  id: string;
  title: string;
  body_md: string;
  body_hash: string;
};

/** A week of per-concept review history, the input to the Snowflake report. */
export type ConceptStat = {
  concept: string;
  reviews: number;
  recalled: number;
  avg_stability: number;
  avg_difficulty: number;
};

export const REPORT_WINDOW_DAYS = 7;

/**
 * Null for a source that does not exist *or* is not `ready`. The markdown
 * invariant is the only gate into the extract pipeline, so an unfinished
 * ingest is indistinguishable from a missing source as far as C is concerned.
 */
export async function loadSource(id: string): Promise<AiSource | null> {
  if (dbConfigured()) {
    const rows = await query<{
      id: string;
      title: string;
      markdown: string | null;
    }>(
      `select id, title, markdown from source
        where id = $1 and ingest_status = 'ready' and markdown is not null`,
      [id],
    );
    const row = rows[0];
    return row?.markdown ? { id: row.id, title: row.title, markdown: row.markdown } : null;
  }
  const seeded = sourceById(id);
  if (!seeded || seeded.ingest_status !== "ready") return null;
  return { id: seeded.id, title: seeded.title, markdown: seeded.markdown };
}

/** Returned in the order requested; unknown ids are dropped. */
export async function loadExtracts(idList: string[]): Promise<AiExtract[]> {
  const found = new Map<string, AiExtract>();
  if (dbConfigured()) {
    const rows = await query<{
      id: string;
      body_md: string;
      priority: number;
      parent_title: string | null;
    }>(
      `select e.id, e.body_md, e.priority,
              coalesce(s.title, n.title) as parent_title
         from extract e
         left join source s on s.id = e.source_id
         left join note   n on n.id = e.note_id
        where e.id = any($1::uuid[])`,
      [idList],
    );
    for (const row of rows) {
      found.set(row.id, {
        id: row.id,
        body_md: row.body_md,
        priority: row.priority,
        parent_title: row.parent_title ?? "Untitled",
      });
    }
  } else {
    for (const id of idList) {
      const seeded = extractById(id);
      if (!seeded) continue;
      const parent = seeded.source_id ? sourceById(seeded.source_id) : undefined;
      found.set(id, {
        id: seeded.id,
        body_md: seeded.body_md,
        priority: seeded.priority,
        parent_title: parent?.title ?? "Untitled",
      });
    }
  }
  return idList.map((id) => found.get(id)).filter((e): e is AiExtract => e !== undefined);
}

export async function loadNote(id: string): Promise<AiNote | null> {
  const note = await getNote(id);
  if (!note) return null;
  return {
    id: note.id,
    title: note.title,
    body_md: note.body_md,
    body_hash: note.body_hash,
  };
}

/**
 * Reads the continuous aggregate rather than the hypertable, so the report
 * costs one cheap query no matter how much review history exists. Concepts
 * with no reviews in the window come back with zeroes, which is what makes
 * "untouched" answerable.
 */
export async function loadConceptStats(): Promise<ConceptStat[]> {
  if (dbConfigured()) {
    return query<ConceptStat>(
      `select c.label as concept,
              coalesce(sum(rd.reviews), 0)::int  as reviews,
              coalesce(sum(rd.recalled), 0)::int as recalled,
              coalesce(sum(rd.avg_stability  * rd.reviews) / nullif(sum(rd.reviews), 0), 0) as avg_stability,
              coalesce(sum(rd.avg_difficulty * rd.reviews) / nullif(sum(rd.reviews), 0), 0) as avg_difficulty
         from concept c
         left join review_daily rd
                on rd.concept_id = c.id
               and rd.bucket >= now() - ($1 || ' days')::interval
        group by c.label
        order by reviews desc, c.label`,
      [String(REPORT_WINDOW_DAYS)],
    );
  }

  const cutoff = new Date(
    SEED_NOW.getTime() - REPORT_WINDOW_DAYS * 86_400_000,
  ).toISOString();
  const labels = new Map(concepts.map((c) => [c.id, c.label]));
  const totals = new Map<string, { reviews: number; recalled: number; stability: number; difficulty: number }>();
  for (const [, label] of labels) {
    totals.set(label, { reviews: 0, recalled: 0, stability: 0, difficulty: 0 });
  }
  for (const row of seedReviewDaily) {
    if (row.bucket < cutoff.slice(0, 10)) continue;
    const label = labels.get(row.concept_id);
    if (!label) continue;
    const acc = totals.get(label)!;
    acc.reviews += row.reviews;
    acc.recalled += row.recalled;
    acc.stability += row.avg_stability * row.reviews;
    acc.difficulty += row.avg_difficulty * row.reviews;
  }
  return [...totals.entries()]
    .map(([concept, acc]) => ({
      concept,
      reviews: acc.reviews,
      recalled: acc.recalled,
      avg_stability: acc.reviews ? acc.stability / acc.reviews : 0,
      avg_difficulty: acc.reviews ? acc.difficulty / acc.reviews : 0,
    }))
    .sort((a, b) => b.reviews - a.reviews || a.concept.localeCompare(b.concept));
}
