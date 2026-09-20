import type { SelectorBundle } from "@/lib/contracts/anchor";
import { dbConfigured, query } from "@/lib/db";
import { memory } from "./memory";
import { isoString, type ExtractRow } from "./types";

const COLUMNS = `id, source_id, note_id, body_md, priority, selector,
                 anchor_status, suggested_by, accepted, suggestion_reason,
                 suggestion_concepts, created_at`;

function hydrate(row: Record<string, unknown>): ExtractRow {
  return {
    id: String(row.id),
    source_id: (row.source_id as string | null) ?? null,
    note_id: (row.note_id as string | null) ?? null,
    body_md: String(row.body_md),
    priority: Number(row.priority),
    selector: row.selector as SelectorBundle,
    anchor_status: row.anchor_status as ExtractRow["anchor_status"],
    suggested_by: row.suggested_by as ExtractRow["suggested_by"],
    accepted: Boolean(row.accepted),
    suggestion_reason: (row.suggestion_reason as string | null) ?? null,
    suggestion_concepts: Array.isArray(row.suggestion_concepts)
      ? row.suggestion_concepts.map(String)
      : [],
    created_at: isoString(row.created_at),
  };
}

export async function listExtracts(): Promise<ExtractRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from extract where accepted order by created_at desc`,
    );
    return rows.map(hydrate);
  }
  return memory().extracts.filter((extract) => extract.accepted);
}

export async function getExtract(id: string): Promise<ExtractRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from extract where id = $1 and accepted limit 1`,
      [id],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return memory().extracts.find(
    (extract) => extract.id === id && extract.accepted,
  ) ?? null;
}

export async function listSourceExtracts(sourceId: string): Promise<ExtractRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from extract
       where source_id = $1 and accepted
       order by priority, created_at`,
      [sourceId],
    );
    return rows.map(hydrate);
  }
  return memory().extracts
    .filter((extract) => extract.source_id === sourceId && extract.accepted)
    .sort((a, b) => a.priority - b.priority || a.created_at.localeCompare(b.created_at));
}

export type CreateExtractInput = {
  source_id: string;
  body_md: string;
  priority: number;
  selector: SelectorBundle;
  suggested_by: "human" | "nemotron";
  reason?: string;
  concepts?: string[];
};

export type CreateExtractResult =
  | { created: true; extract: ExtractRow }
  | { created: false; extract: ExtractRow };

export async function createExtract(
  input: CreateExtractInput,
): Promise<CreateExtractResult> {
  if (dbConfigured()) {
    const rows = await query(
      `insert into extract
         (source_id, body_md, priority, selector, suggested_by, accepted,
          suggestion_reason, suggestion_concepts)
       values ($1, $2, $3, $4::jsonb, $5, true, $6, $7::text[])
       on conflict (source_id, body_md) where source_id is not null and accepted
       do nothing
       returning ${COLUMNS}`,
      [
        input.source_id,
        input.body_md,
        input.priority,
        JSON.stringify(input.selector),
        input.suggested_by,
        input.reason?.trim() || null,
        input.concepts ?? [],
      ],
    );
    if (rows[0]) return { created: true, extract: hydrate(rows[0]) };
    const existing = await query(
      `select ${COLUMNS} from extract
       where source_id = $1 and body_md = $2 and accepted limit 1`,
      [input.source_id, input.body_md],
    );
    return { created: false, extract: hydrate(existing[0]) };
  }

  const existing = memory().extracts.find(
    (extract) =>
      extract.source_id === input.source_id &&
      extract.body_md === input.body_md &&
      extract.accepted,
  );
  if (existing) return { created: false, extract: existing };

  const extract: ExtractRow = {
    id: crypto.randomUUID(),
    source_id: input.source_id,
    note_id: null,
    body_md: input.body_md,
    priority: input.priority,
    selector: input.selector,
    anchor_status: "anchored",
    suggested_by: input.suggested_by,
    accepted: true,
    suggestion_reason: input.reason?.trim() || null,
    suggestion_concepts: input.concepts ?? [],
    created_at: new Date().toISOString(),
  };
  memory().extracts.push(extract);
  return { created: true, extract };
}