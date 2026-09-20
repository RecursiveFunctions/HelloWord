/**
 * The no-database backend.
 *
 * `npm run dev` with an empty `DATABASE_URL` still has to render every screen
 * and accept a real ingest, so the store falls back to these tables. They start
 * as a copy of `lib/seed` and accept writes for the rest of the process.
 *
 * State is parked on `globalThis` so the Turbopack dev server keeps it across
 * hot reloads. It is per-process and therefore useless on serverless, which is
 * fine: anything deployed has `DATABASE_URL` set and never reaches this file.
 */
import {
  activities as seedActivities,
  extracts as seedExtracts,
  notebookItems as seedNotebookItems,
  notebooks as seedNotebooks,
  schedulerProfile as seedProfile,
  schedules as seedSchedules,
  sources as seedSources,
} from "@/lib/seed";
import { isPublicCoverPath, resetCoverBlobs } from "./covers";
import { DEFAULT_FEEDS } from "./default-feeds";
import type {
  ActivityRow,
  ExtractRow,
  FeedRow,
  NotebookItemRow,
  NotebookRow,
  ReviewEventRow,
  ScheduleRow,
  SchedulerProfileRow,
  SourceRow,
} from "./types";

export type MemoryTables = {
  sources: SourceRow[];
  extracts: ExtractRow[];
  notebooks: NotebookRow[];
  notebookItems: NotebookItemRow[];
  feeds: FeedRow[];
  activities: ActivityRow[];
  schedules: ScheduleRow[];
  profile: SchedulerProfileRow;
  reviewEvents: ReviewEventRow[];
};

function seeded(): MemoryTables {
  return {
    sources: seedSources.map((source) => ({ ...source, ingest_error: null })),
    notebooks: seedNotebooks.map((notebook) => ({
      ...notebook,
      cover_storage_key: notebook.cover_storage_key ?? null,
    })),
    notebookItems: seedNotebookItems.map((item) => ({ ...item })),
    feeds: DEFAULT_FEEDS.map((feed, index) => ({
      id: `99999999-9999-4999-8999-99999999900${index + 1}`,
      title: feed.title,
      feed_url: feed.feed_url,
      site_url: feed.site_url,
      last_fetched_at: null,
      created_at: new Date(0).toISOString(),
    })),
    activities: seedActivities.map((activity) => ({
      ...activity,
      variant_of: activity.variant_of ?? null,
    })),
    schedules: seedSchedules.map((schedule) => ({ ...schedule })),
    profile: { ...seedProfile, clock_offset_ms: 0 },
    reviewEvents: [],
  };
}

const holder = globalThis as unknown as {
  __helloword_memory?: Partial<MemoryTables>;
};

export function memory(): MemoryTables {
  const existing = holder.__helloword_memory;
  if (!existing) {
    const fresh = seeded();
    holder.__helloword_memory = fresh;
    return fresh;
  }

  // Preserve hot-reloaded state while backfilling tables introduced by newer
  // code.
  for (const [key, value] of Object.entries(seeded())) {
    if (existing[key as keyof MemoryTables] === undefined) {
      Object.assign(existing, { [key]: value });
    }
  }

  // A reload that *adds a column* to an existing table (cover_storage_key)
  // should pick up the field without throwing away in-flight writes. Public
  // SVG stills are no longer used as card faces.
  if (existing.notebooks) {
    for (const notebook of existing.notebooks) {
      if (notebook.cover_storage_key === undefined) {
        notebook.cover_storage_key = null;
      }
      if (
        notebook.cover_storage_key &&
        isPublicCoverPath(notebook.cover_storage_key)
      ) {
        notebook.cover_storage_key = null;
      }
    }
  }

  return existing as MemoryTables;
}

/** Only for tests and the "reset demo data" affordance. */
export function resetMemory(): void {
  holder.__helloword_memory = seeded();
  resetCoverBlobs();
}
