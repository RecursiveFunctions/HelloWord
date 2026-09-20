import type { ActivityPayload } from "@/lib/contracts/activity";
import { dbConfigured, query } from "@/lib/db";
import { memory } from "./memory";
import { isoString, type DistillDraftRow, type DraftStatus } from "./types";

const COLUMNS = `extract_id, status, note_title, note_body_md, note_concepts,
                 activities, error, updated_at`;

/**
 * How long a `drafting_*` claim is honoured. A model call gets 45 seconds and
 * the function 60; a claim older than this belongs to a function that died, and
 * leaving it would strand the draft forever.
 */
export const CLAIM_TTL_MS = 90_000;

function hydrate(row: Record<string, unknown>): DistillDraftRow {
  return {
    extract_id: String(row.extract_id),
    status: row.status as DraftStatus,
    note_title: (row.note_title as string | null) ?? null,
    note_body_md: (row.note_body_md as string | null) ?? null,
    note_concepts: Array.isArray(row.note_concepts) ? row.note_concepts.map(String) : [],
    activities: Array.isArray(row.activities) ? (row.activities as ActivityPayload[]) : [],
    error: (row.error as string | null) ?? null,
    updated_at: isoString(row.updated_at),
  };
}

export async function getDraft(extractId: string): Promise<DistillDraftRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from distill_draft where extract_id = $1 limit 1`,
      [extractId],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return memory().distillDrafts.find((draft) => draft.extract_id === extractId) ?? null;
}

export async function listDrafts(extractIds: string[]): Promise<DistillDraftRow[]> {
  if (extractIds.length === 0) return [];
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from distill_draft where extract_id = any($1::uuid[])`,
      [extractIds],
    );
    return rows.map(hydrate);
  }
  const wanted = new Set(extractIds);
  return memory().distillDrafts.filter((draft) => wanted.has(draft.extract_id));
}

/** Idempotent: an extract that already has a draft keeps it. */
export async function ensureDraft(extractId: string): Promise<DistillDraftRow> {
  if (dbConfigured()) {
    await query(
      `insert into distill_draft (extract_id) values ($1) on conflict do nothing`,
      [extractId],
    );
    return (await getDraft(extractId))!;
  }
  const existing = memory().distillDrafts.find((draft) => draft.extract_id === extractId);
  if (existing) return existing;
  const draft: DistillDraftRow = {
    extract_id: extractId,
    status: "pending",
    note_title: null,
    note_body_md: null,
    note_concepts: [],
    activities: [],
    error: null,
    updated_at: new Date().toISOString(),
  };
  memory().distillDrafts.push(draft);
  return draft;
}

/**
 * Move a draft from `from` to `to`, only if it is still in `from`. Null means
 * another request got there first, which is the whole point: two tabs
 * prefetching the same draft must not both pay for the model call.
 *
 * A stale claim (see `CLAIM_TTL_MS`) counts as its resting state, so `from`
 * of `pending` also matches an abandoned `drafting_note`.
 */
export async function claimDraft(
  extractId: string,
  from: "pending" | "note_ready",
  to: "drafting_note" | "drafting_cards",
): Promise<DistillDraftRow | null> {
  const staleBefore = new Date(Date.now() - CLAIM_TTL_MS).toISOString();
  if (dbConfigured()) {
    const rows = await query(
      `update distill_draft
          set status = $3, error = null, updated_at = now()
        where extract_id = $1
          and (status = $2 or (status = $3 and updated_at < $4))
        returning ${COLUMNS}`,
      [extractId, from, to, staleBefore],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }
  const draft = memory().distillDrafts.find((row) => row.extract_id === extractId);
  if (!draft) return null;
  const stale = draft.status === to && draft.updated_at < staleBefore;
  if (draft.status !== from && !stale) return null;
  Object.assign(draft, { status: to, error: null, updated_at: new Date().toISOString() });
  return draft;
}

export type DraftPatch = Partial<
  Pick<
    DistillDraftRow,
    "status" | "note_title" | "note_body_md" | "note_concepts" | "activities" | "error"
  >
>;

export async function updateDraft(
  extractId: string,
  patch: DraftPatch,
): Promise<DistillDraftRow | null> {
  const entries = Object.entries(patch).filter(([, value]) => value !== undefined);
  if (entries.length === 0) return getDraft(extractId);

  if (dbConfigured()) {
    const assignments = entries.map(([column], index) => {
      const param = `$${index + 2}`;
      if (column === "activities") return `${column} = ${param}::jsonb`;
      if (column === "note_concepts") return `${column} = ${param}::text[]`;
      return `${column} = ${param}`;
    });
    const rows = await query(
      `update distill_draft set ${assignments.join(", ")}, updated_at = now()
        where extract_id = $1 returning ${COLUMNS}`,
      [
        extractId,
        ...entries.map(([column, value]) =>
          column === "activities" ? JSON.stringify(value) : value,
        ),
      ],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }

  const draft = memory().distillDrafts.find((row) => row.extract_id === extractId);
  if (!draft) return null;
  Object.assign(draft, Object.fromEntries(entries), { updated_at: new Date().toISOString() });
  return draft;
}

/** Hand a draft from a retired proposal to the extract that survived it. */
export async function moveDraft(fromExtractId: string, toExtractId: string): Promise<void> {
  if (fromExtractId === toExtractId) return;
  if (dbConfigured()) {
    await query(`delete from distill_draft where extract_id = $1`, [toExtractId]);
    await query(`update distill_draft set extract_id = $2 where extract_id = $1`, [
      fromExtractId,
      toExtractId,
    ]);
    return;
  }
  const tables = memory();
  tables.distillDrafts = tables.distillDrafts.filter(
    (draft) => draft.extract_id !== toExtractId,
  );
  const draft = tables.distillDrafts.find((row) => row.extract_id === fromExtractId);
  if (draft) draft.extract_id = toExtractId;
}
