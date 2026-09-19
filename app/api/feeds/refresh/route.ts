import { parseFeed } from "feedsmith";
import { z } from "zod";
import { createFeed, listFeeds, markFeedFetched } from "@/lib/store/feeds";
import { listSources } from "@/lib/store/sources";
import { invalid, ok, readJson } from "../../_respond";

export const maxDuration = 30;

const RefreshBody = z.object({
  /** Subscribe to a new feed and include it in this refresh. */
  feed_url: z.string().url().optional(),
  limit: z.number().int().min(1).max(50).default(12),
});

export type FeedCandidate = {
  title: string;
  url: string;
  published: string | null;
  feed: string;
  /** Already a source, so the Library shows "in library" instead of "Add". */
  known: boolean;
};

/** GET lists subscriptions without hitting the network. */
export async function GET(): Promise<Response> {
  return ok({ feeds: await listFeeds() });
}

export async function POST(request: Request): Promise<Response> {
  const parsed = RefreshBody.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return invalid(parsed.error);

  if (parsed.data.feed_url) {
    await createFeed({
      title: new URL(parsed.data.feed_url).hostname,
      feed_url: parsed.data.feed_url,
    });
  }

  const feeds = await listFeeds();
  const existing = new Set((await listSources()).map((s) => s.origin_uri));

  const settled = await Promise.allSettled(
    feeds.map(async (feed) => {
      const candidates = await pull(feed.feed_url, feed.title);
      await markFeedFetched(feed.id);
      return candidates;
    }),
  );

  const errors: string[] = [];
  const seen = new Set<string>();
  const candidates: FeedCandidate[] = [];

  for (const [index, result] of settled.entries()) {
    if (result.status === "rejected") {
      errors.push(`${feeds[index].title}: ${describe(result.reason)}`);
      continue;
    }
    for (const item of result.value) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      candidates.push({ ...item, known: existing.has(item.url) });
    }
  }

  candidates.sort(
    (a, b) => Date.parse(b.published ?? "0") - Date.parse(a.published ?? "0"),
  );

  return ok({
    candidates: candidates.slice(0, parsed.data.limit),
    errors,
  });
}

async function pull(
  feedUrl: string,
  feedTitle: string,
): Promise<Omit<FeedCandidate, "known">[]> {
  const response = await fetch(feedUrl, {
    headers: {
      accept: "application/atom+xml, application/rss+xml, application/xml;q=0.9, */*;q=0.8",
    },
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }

  // feedsmith sniffs RSS, Atom, RDF, and JSON Feed from the payload itself.
  const parsed = parseFeed(await response.text());

  switch (parsed.format) {
    case "rss":
      return (parsed.feed.items ?? []).flatMap((item) =>
        item.link && item.title
          ? [
              {
                title: item.title,
                url: item.link,
                published: normalizeDate(item.pubDate ?? item.dc?.dates?.[0]),
                feed: feedTitle,
              },
            ]
          : [],
      );

    // RDF has no pubDate of its own; dates arrive through Dublin Core.
    case "rdf":
      return (parsed.feed.items ?? []).flatMap((item) =>
        item.link && item.title
          ? [
              {
                title: item.title,
                url: item.link,
                published: normalizeDate(item.dc?.dates?.[0]),
                feed: feedTitle,
              },
            ]
          : [],
      );

    case "atom":
      return (parsed.feed.entries ?? []).flatMap((entry) => {
        // Atom entries carry several links; the readable page is the one with
        // rel="alternate" or no rel at all.
        const href = entry.links?.find(
          (link) => !link.rel || link.rel === "alternate",
        )?.href;
        const title = entry.title?.value;
        return href && title
          ? [
              {
                title,
                url: href,
                published: normalizeDate(entry.published ?? entry.updated),
                feed: feedTitle,
              },
            ]
          : [];
      });

    case "json":
      return (parsed.feed.items ?? []).flatMap((item) =>
        item.url
          ? [
              {
                title: item.title ?? item.url,
                url: item.url,
                published: normalizeDate(item.date_published),
                feed: feedTitle,
              },
            ]
          : [],
      );
  }
}

function normalizeDate(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
