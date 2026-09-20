import { dbConfigured, query } from "./db";

/**
 * One sentinel per migration: a column that exists only once that file has
 * run. `/api/health` checks them so a database that is behind the code says
 * "501_distill_drafts.sql is missing" instead of answering every route with a
 * bare 500, which is all production had to say the first time this happened.
 *
 * Add a line here in the same PR as a migration. Forgetting costs nothing but
 * the diagnosis: the deploy still applies the migration either way.
 */
export const SCHEMA_SENTINELS: { migration: string; table: string; column: string }[] = [
  { migration: "100_feeds.sql", table: "feed", column: "feed_url" },
  { migration: "101_notebook_cover.sql", table: "notebook", column: "cover_storage_key" },
  { migration: "200_extract_proposal_metadata.sql", table: "extract", column: "suggestion_reason" },
  { migration: "201_extract_backed_activities.sql", table: "activity", column: "extract_id" },
  { migration: "400_review_clock.sql", table: "scheduler_profile", column: "clock_offset_ms" },
  { migration: "500_extract_queue.sql", table: "extract", column: "queue_status" },
  { migration: "501_distill_drafts.sql", table: "distill_draft", column: "extract_id" },
  { migration: "600_soft_delete.sql", table: "extract", column: "deleted_at" },
];

export type SchemaHealth =
  | { ok: true; missing: [] }
  | { ok: false; missing: string[]; error?: string };

export async function schemaHealth(): Promise<SchemaHealth | null> {
  if (!dbConfigured()) return null;
  try {
    const rows = await query<{ table_name: string; column_name: string }>(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and table_name = any($1::text[])`,
      [[...new Set(SCHEMA_SENTINELS.map((s) => s.table))]],
    );
    const present = new Set(rows.map((row) => `${row.table_name}.${row.column_name}`));
    const missing = SCHEMA_SENTINELS.filter(
      (s) => !present.has(`${s.table}.${s.column}`),
    ).map((s) => s.migration);
    return missing.length ? { ok: false, missing } : { ok: true, missing: [] };
  } catch (error) {
    return {
      ok: false,
      missing: [],
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
