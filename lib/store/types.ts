/**
 * Row shapes for the tables workstream A owns: `source`, `notebook`,
 * `notebook_item`, and the additive `feed` table from migration 100.
 *
 * Timestamps are ISO strings on the way out, whichever backend produced them,
 * so Server Components can hand them to Client Components without a serializer.
 */

export type IngestStatus = "pending" | "processing" | "ready" | "failed";

export type IngestMethod =
  | "unpdf"
  | "defuddle"
  | "gemini_vision"
  | "gemini_url";

export type SourceRow = {
  id: string;
  kind: "pdf" | "url";
  title: string;
  origin_uri: string;
  storage_key: string | null;
  markdown: string | null;
  ingest_status: IngestStatus;
  ingest_method: IngestMethod | null;
  ingest_error: string | null;
  word_count: number | null;
  created_at: string;
};

export type NotebookRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  created_at: string;
};

export type NotebookItemType = "source" | "note" | "extract" | "activity";

export type NotebookItemRow = {
  notebook_id: string;
  item_type: NotebookItemType;
  item_id: string;
  added_at: string;
};

export type FeedRow = {
  id: string;
  title: string;
  feed_url: string;
  site_url: string | null;
  last_fetched_at: string | null;
  created_at: string;
};

/** pg returns `timestamptz` as a Date; the seed and memory store use strings. */
export function isoString(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return new Date().toISOString();
}

export function isoStringOrNull(value: unknown): string | null {
  if (value == null) return null;
  return isoString(value);
}
