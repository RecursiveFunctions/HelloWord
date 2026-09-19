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
  notebookItems as seedNotebookItems,
  notebooks as seedNotebooks,
  sources as seedSources,
} from "@/lib/seed";
import { DEFAULT_FEEDS } from "./default-feeds";
import type {
  FeedRow,
  NotebookItemRow,
  NotebookRow,
  SourceRow,
} from "./types";

export type MemoryTables = {
  sources: SourceRow[];
  notebooks: NotebookRow[];
  notebookItems: NotebookItemRow[];
  feeds: FeedRow[];
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
  };
}

const holder = globalThis as unknown as { __helloword_memory?: MemoryTables };

export function memory(): MemoryTables {
  holder.__helloword_memory ??= seeded();
  return holder.__helloword_memory;
}

/** Only for tests and the "reset demo data" affordance. */
export function resetMemory(): void {
  holder.__helloword_memory = seeded();
}
