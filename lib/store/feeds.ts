import { dbConfigured, query } from "@/lib/db";
import { memory } from "./memory";
import { isoString, isoStringOrNull, type FeedRow } from "./types";

const COLUMNS = `id, title, feed_url, site_url, last_fetched_at, created_at`;

function hydrate(row: Record<string, unknown>): FeedRow {
  return {
    id: String(row.id),
    title: String(row.title),
    feed_url: String(row.feed_url),
    site_url: (row.site_url as string | null) ?? null,
    last_fetched_at: isoStringOrNull(row.last_fetched_at),
    created_at: isoString(row.created_at),
  };
}

export async function listFeeds(): Promise<FeedRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from feed order by created_at asc`,
    );
    return rows.map(hydrate);
  }
  return [...memory().feeds];
}

export async function createFeed(input: {
  title: string;
  feed_url: string;
  site_url?: string | null;
}): Promise<FeedRow> {
  if (dbConfigured()) {
    const rows = await query(
      `insert into feed (title, feed_url, site_url) values ($1, $2, $3)
       on conflict (feed_url) do update set title = excluded.title
       returning ${COLUMNS}`,
      [input.title, input.feed_url, input.site_url ?? null],
    );
    return hydrate(rows[0]);
  }

  const tables = memory();
  const existing = tables.feeds.find((f) => f.feed_url === input.feed_url);
  if (existing) return existing;

  const row: FeedRow = {
    id: crypto.randomUUID(),
    title: input.title,
    feed_url: input.feed_url,
    site_url: input.site_url ?? null,
    last_fetched_at: null,
    created_at: new Date().toISOString(),
  };
  tables.feeds.push(row);
  return row;
}

export async function markFeedFetched(id: string): Promise<void> {
  const now = new Date().toISOString();
  if (dbConfigured()) {
    await query(`update feed set last_fetched_at = $2 where id = $1`, [id, now]);
    return;
  }
  const feed = memory().feeds.find((f) => f.id === id);
  if (feed) feed.last_fetched_at = now;
}
