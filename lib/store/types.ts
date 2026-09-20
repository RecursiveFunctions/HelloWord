import type { SelectorBundle } from "@/lib/contracts/anchor";

/**
 * Row shapes for the tables the store reads: `source`, `notebook`,
 * `notebook_item`, the additive `feed` table from migration 100, and the
 * review side — `activity`, `schedule`, `scheduler_profile`, `review_event`.
 *
 * Timestamps are ISO strings on the way out, whichever backend produced them,
 * so Server Components can hand them to Client Components without a serializer.
 */
import type { ActivityPayload, Rating } from "@/lib/contracts/activity";

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

export type NoteRow = {
  id: string;
  title: string;
  body_md: string;
  body_hash: string;
  origin: "human" | "ai_drafted" | "ai_edited";
  created_at: string;
  updated_at: string;
};

export type ConceptRow = {
  id: string;
  label: string;
};

export type ConceptNoteRow = {
  concept_id: string;
  note_id: string;
};

export type ConceptExtractRow = {
  concept_id: string;
  extract_id: string;
};

export type ExtractRow = {
  id: string;
  source_id: string | null;
  note_id: string | null;
  body_md: string;
  priority: number;
  selector: SelectorBundle;
  anchor_status: "anchored" | "orphaned" | "detached";
  suggested_by: "human" | "nemotron";
  accepted: boolean;
  suggestion_reason: string | null;
  suggestion_concepts: string[];
  created_at: string;
};

export type NotebookRow = {
  id: string;
  name: string;
  description: string | null;
  color: string | null;
  /**
   * Pointer to a screenshot of the note shown on the Notebooks card.
   * Public paths start with `/`; uploads use `memory:{id}` or a Spaces key.
   */
  cover_storage_key: string | null;
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

export type ActivityRow = {
  id: string;
  note_id: string | null;
  extract_id: string | null;
  type: ActivityPayload["type"];
  payload: ActivityPayload;
  source_body_hash: string | null;
  variant_of: string | null;
  created_at: string;
};

/**
 * One row per card. `due` and `last_review` are always wall-clock: the virtual
 * clock lives entirely inside `lib/fsrs`, so `where due <= now()` stays true
 * no matter which preset is active.
 */
export type ScheduleRow = {
  activity_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  /** ts-fsrs State: 0 New, 1 Learning, 2 Review, 3 Relearning. */
  state: number;
  last_review: string | null;
  /** Per-card interval multiplier applied after FSRS. 1.0 is "as FSRS said". */
  a_factor: number;
};

export type SchedulerProfileRow = {
  id: string;
  name: string;
  request_retention: number;
  maximum_interval: number;
  learning_steps: string[];
  relearning_steps: string[];
  enable_fuzz: boolean;
  interval_modifier: number;
  day_ms: number;
  /**
   * Milliseconds added to wall-clock time for every review query. Non-zero
   * means the reviewer has skipped ahead to reach the next card; it shifts the
   * observer, never the schedule.
   */
  clock_offset_ms: number;
  created_at: string;
};

export type ReviewEventRow = {
  time: string;
  activity_id: string;
  note_id: string | null;
  extract_id: string | null;
  concept_id: string | null;
  rating: Rating;
  state: number;
  elapsed_days: number;
  scheduled_days: number;
  stability: number;
  difficulty: number;
  duration_ms: number | null;
  mode: "queue" | "quiz" | "voice";
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
