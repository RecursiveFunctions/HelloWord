import { dbConfigured, query } from "@/lib/db";
import { memory } from "./memory";
import {
  isoString,
  type IngestMethod,
  type IngestStatus,
  type SourceRow,
} from "./types";

const COLUMNS = `id, kind, title, origin_uri, storage_key, markdown,
                 ingest_status, ingest_method, ingest_error, word_count, created_at`;

function hydrate(row: Record<string, unknown>): SourceRow {
  return {
    id: String(row.id),
    kind: row.kind as SourceRow["kind"],
    title: String(row.title),
    origin_uri: String(row.origin_uri),
    storage_key: (row.storage_key as string | null) ?? null,
    markdown: (row.markdown as string | null) ?? null,
    ingest_status: row.ingest_status as IngestStatus,
    ingest_method: (row.ingest_method as IngestMethod | null) ?? null,
    ingest_error: (row.ingest_error as string | null) ?? null,
    word_count: (row.word_count as number | null) ?? null,
    created_at: isoString(row.created_at),
  };
}

const newestFirst = (a: SourceRow, b: SourceRow) =>
  Date.parse(b.created_at) - Date.parse(a.created_at);

export async function listSources(): Promise<SourceRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from source order by created_at desc`,
    );
    return rows.map(hydrate);
  }
  return [...memory().sources].sort(newestFirst);
}

export async function getSource(id: string): Promise<SourceRow | null> {
  if (dbConfigured()) {
    const rows = await query(`select ${COLUMNS} from source where id = $1`, [
      id,
    ]);
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return memory().sources.find((source) => source.id === id) ?? null;
}

export async function findSourceByUri(uri: string): Promise<SourceRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from source where origin_uri = $1
       order by created_at desc limit 1`,
      [uri],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return (
    [...memory().sources]
      .sort(newestFirst)
      .find((source) => source.origin_uri === uri) ?? null
  );
}

export type CreateSourceInput = {
  kind: SourceRow["kind"];
  title: string;
  origin_uri: string;
  storage_key?: string | null;
};

export async function createSource(
  input: CreateSourceInput,
): Promise<SourceRow> {
  if (dbConfigured()) {
    const rows = await query(
      `insert into source (kind, title, origin_uri, storage_key, ingest_status)
       values ($1, $2, $3, $4, 'pending')
       returning ${COLUMNS}`,
      [input.kind, input.title, input.origin_uri, input.storage_key ?? null],
    );
    return hydrate(rows[0]);
  }

  const row: SourceRow = {
    id: crypto.randomUUID(),
    kind: input.kind,
    title: input.title,
    origin_uri: input.origin_uri,
    storage_key: input.storage_key ?? null,
    markdown: null,
    ingest_status: "pending",
    ingest_method: null,
    ingest_error: null,
    word_count: null,
    created_at: new Date().toISOString(),
  };
  memory().sources.unshift(row);
  return row;
}

export type SourcePatch = Partial<
  Pick<
    SourceRow,
    | "title"
    | "storage_key"
    | "markdown"
    | "ingest_status"
    | "ingest_method"
    | "ingest_error"
    | "word_count"
  >
>;

export async function updateSource(
  id: string,
  patch: SourcePatch,
): Promise<SourceRow | null> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return getSource(id);

  // The schema's `source_ready_implies_markdown` check is the real gate, but the
  // memory backend has no constraints, so assert it here for both backends.
  if (patch.ingest_status === "ready" && !patch.markdown) {
    const existing = await getSource(id);
    if (!existing?.markdown) {
      throw new Error(
        `Refusing to mark source ${id} ready with no markdown. Nothing downstream of ingest may see a non-markdown source.`,
      );
    }
  }

  if (dbConfigured()) {
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 2}`)
      .join(", ");
    const rows = await query(
      `update source set ${assignments} where id = $1 returning ${COLUMNS}`,
      [id, ...entries.map(([, value]) => value)],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }

  const row = memory().sources.find((source) => source.id === id);
  if (!row) return null;
  Object.assign(row, Object.fromEntries(entries));
  return row;
}
