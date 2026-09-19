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
  notebookItems as seedNotebookItems,
  notebooks as seedNotebooks,
  schedulerProfile as seedProfile,
  schedules as seedSchedules,
  sources as seedSources,
} from "@/lib/seed";
import { DEFAULT_FEEDS } from "./default-feeds";
import type {
  ActivityRow,
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
    notebooks: seedNotebooks.map((notebook) => ({ ...notebook })),
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

  // Surviving a hot reload is the point of parking this on `globalThis`, but a
  // reload that *adds* a table finds the cached object missing it. Backfill
  // rather than reset, so an ingest in flight is not thrown away.
  for (const [key, value] of Object.entries(seeded())) {
    if (existing[key as keyof MemoryTables] === undefined) {
      Object.assign(existing, { [key]: value });
    }
  }
  return existing as MemoryTables;
}

/** Only for tests and the "reset demo data" affordance. */
export function resetMemory(): void {
  holder.__helloword_memory = seeded();
}
