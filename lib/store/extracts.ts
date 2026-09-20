import type { SelectorBundle } from "@/lib/contracts/anchor";
import { dbConfigured, query } from "@/lib/db";
import { memory } from "./memory";
import {
  isoString,
  isoStringOrNull,
  type ExtractRow,
  type QueueStatus,
} from "./types";

const COLUMNS = `id, source_id, note_id, body_md, priority, selector,
                 anchor_status, suggested_by, accepted, suggestion_reason,
                 suggestion_concepts, queue_status, queue_due,
                 queue_interval_days, queue_reps, queue_last_seen, created_at`;

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
    queue_status: (row.queue_status as QueueStatus | undefined) ?? "queued",
    queue_due: isoString(row.queue_due),
    queue_interval_days: Number(row.queue_interval_days ?? 1),
    queue_reps: Number(row.queue_reps ?? 0),
    queue_last_seen: isoStringOrNull(row.queue_last_seen),
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
    queue_status: "queued",
    queue_due: new Date().toISOString(),
    queue_interval_days: 1,
    queue_reps: 0,
    queue_last_seen: null,
    created_at: new Date().toISOString(),
  };
  memory().extracts.push(extract);
  return { created: true, extract };
}

/**
 * An AI proposal nobody has looked at yet: `accepted = false`, so every reader
 * of `extract` that filters on `accepted` ignores it, and the partial unique
 * index does too. It sits in the reading queue waiting to be triaged.
 */
export async function createProposedExtract(
  input: Omit<CreateExtractInput, "suggested_by">,
): Promise<ExtractRow> {
  if (dbConfigured()) {
    const rows = await query(
      `insert into extract
         (source_id, body_md, priority, selector, suggested_by, accepted,
          suggestion_reason, suggestion_concepts)
       values ($1, $2, $3, $4::jsonb, 'nemotron', false, $5, $6::text[])
       returning ${COLUMNS}`,
      [
        input.source_id,
        input.body_md,
        input.priority,
        JSON.stringify(input.selector),
        input.reason?.trim() || null,
        input.concepts ?? [],
      ],
    );
    return hydrate(rows[0]);
  }
  const now = new Date().toISOString();
  const extract: ExtractRow = {
    id: crypto.randomUUID(),
    source_id: input.source_id,
    note_id: null,
    body_md: input.body_md,
    priority: input.priority,
    selector: input.selector,
    anchor_status: "anchored",
    suggested_by: "nemotron",
    accepted: false,
    suggestion_reason: input.reason?.trim() || null,
    suggestion_concepts: input.concepts ?? [],
    queue_status: "queued",
    queue_due: now,
    queue_interval_days: 1,
    queue_reps: 0,
    queue_last_seen: null,
    created_at: now,
  };
  memory().extracts.push(extract);
  return extract;
}

/**
 * Every extract of a source at any status: accepted, pending, dismissed. The
 * distiller reads this so a passage the reader already threw away is not
 * proposed to them a second time.
 */
export async function listSourceExtractsAny(sourceId: string): Promise<ExtractRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from extract where source_id = $1 order by priority, created_at`,
      [sourceId],
    );
    return rows.map(hydrate);
  }
  return memory().extracts.filter((extract) => extract.source_id === sourceId);
}

export async function deleteExtract(id: string): Promise<void> {
  if (dbConfigured()) {
    await query(`delete from extract where id = $1`, [id]);
    return;
  }
  const tables = memory();
  tables.extracts = tables.extracts.filter((extract) => extract.id !== id);
  tables.distillDrafts = tables.distillDrafts.filter((draft) => draft.extract_id !== id);
}

/**
 * The incremental reading queue: what is due, most important first.
 *
 * Priority leads and `queue_due` only breaks ties. Among passages that are all
 * overdue, *how* overdue is noise; which one matters most is the signal.
 *
 * `includePending` lets AI proposals nobody has accepted yet into the queue, so
 * they can be triaged there. Every other reader of `extract` filters them out.
 */
export type ReadingQueueOptions = {
  limit?: number;
  includePending?: boolean;
};

function inQueue(extract: ExtractRow, now: Date, includePending: boolean): boolean {
  return (
    (includePending || extract.accepted) &&
    extract.source_id !== null &&
    extract.queue_status === "queued" &&
    new Date(extract.queue_due) <= now
  );
}

export async function listReadingQueue(
  now: Date,
  options: ReadingQueueOptions = {},
): Promise<ExtractRow[]> {
  const includePending = options.includePending ?? false;
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from extract
       where ($2 or accepted) and source_id is not null
         and queue_status = 'queued' and queue_due <= $1
       order by priority, queue_due, created_at
       ${options.limit ? "limit $3" : ""}`,
      options.limit
        ? [now.toISOString(), includePending, options.limit]
        : [now.toISOString(), includePending],
    );
    return rows.map(hydrate);
  }
  const due = memory()
    .extracts.filter((extract) => inQueue(extract, now, includePending))
    .sort(
      (a, b) =>
        a.priority - b.priority ||
        a.queue_due.localeCompare(b.queue_due) ||
        a.created_at.localeCompare(b.created_at),
    );
  return options.limit ? due.slice(0, options.limit) : due;
}

export type ReadingCounts = { due: number; queued: number };

export async function readingCounts(
  now: Date,
  options: { includePending?: boolean } = {},
): Promise<ReadingCounts> {
  const includePending = options.includePending ?? false;
  if (dbConfigured()) {
    const rows = await query(
      `select count(*) filter (where queue_due <= $1) as due, count(*) as queued
       from extract
       where ($2 or accepted) and source_id is not null and queue_status = 'queued'`,
      [now.toISOString(), includePending],
    );
    return { due: Number(rows[0]?.due ?? 0), queued: Number(rows[0]?.queued ?? 0) };
  }
  const queued = memory().extracts.filter(
    (extract) =>
      (includePending || extract.accepted) &&
      extract.source_id !== null &&
      extract.queue_status === "queued",
  );
  return {
    due: queued.filter((extract) => new Date(extract.queue_due) <= now).length,
    queued: queued.length,
  };
}

/** Unlike `getExtract`, this also finds proposals that are not accepted yet. */
export async function getExtractAny(id: string): Promise<ExtractRow | null> {
  if (dbConfigured()) {
    const rows = await query(`select ${COLUMNS} from extract where id = $1 limit 1`, [id]);
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return memory().extracts.find((extract) => extract.id === id) ?? null;
}

export async function getExtractsByIds(ids: string[]): Promise<ExtractRow[]> {
  if (ids.length === 0) return [];
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from extract where id = any($1::uuid[])`,
      [ids],
    );
    return rows.map(hydrate);
  }
  const wanted = new Set(ids);
  return memory().extracts.filter((extract) => wanted.has(extract.id));
}

export type ExtractPatch = Partial<
  Pick<
    ExtractRow,
    | "priority"
    | "accepted"
    | "queue_status"
    | "queue_due"
    | "queue_interval_days"
    | "queue_reps"
    | "queue_last_seen"
  >
>;

const PATCHABLE = [
  "priority",
  "accepted",
  "queue_status",
  "queue_due",
  "queue_interval_days",
  "queue_reps",
  "queue_last_seen",
] as const satisfies readonly (keyof ExtractPatch)[];

export async function patchExtract(
  id: string,
  patch: ExtractPatch,
): Promise<ExtractRow | null> {
  const entries = PATCHABLE.filter((key) => patch[key] !== undefined).map(
    (key) => [key, patch[key]] as const,
  );
  if (entries.length === 0) return getExtractAny(id);

  if (dbConfigured()) {
    const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
    const rows = await query(
      `update extract set ${assignments.join(", ")} where id = $1 returning ${COLUMNS}`,
      [id, ...entries.map(([, value]) => value)],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }

  const extract = memory().extracts.find((row) => row.id === id);
  if (!extract) return null;
  Object.assign(extract, Object.fromEntries(entries));
  return extract;
}