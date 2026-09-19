import { z } from "zod";
import { dueCounts, queueSnapshot, toClientCard } from "@/lib/fsrs/queue";
import { getProfile } from "@/lib/store/review";
import { fail, ok } from "../../_respond";

export const dynamic = "force-dynamic";

const Query = z.object({
  /**
   * Repeatable: `?notebookId=a&notebookId=b` unions the two. Omit it entirely
   * for everything; pass `scope=none` to select nothing.
   */
  notebookIds: z.array(z.string().uuid()).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

/** The due queue, most overdue first, with answer keys stripped. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const requested = url.searchParams.getAll("notebookId");
  const none = url.searchParams.get("scope") === "none";

  const parsed = Query.safeParse({
    notebookIds: none ? [] : requested.length > 0 ? requested : undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return fail("Invalid query parameters.", 422);

  const [snapshot, counts, profile] = await Promise.all([
    queueSnapshot(parsed.data),
    dueCounts(),
    getProfile(),
  ]);

  return ok({
    counts,
    dayMs: profile.day_ms,
    clockOffsetMs: profile.clock_offset_ms,
    now: snapshot.now,
    nextDue: snapshot.nextDue,
    cards: snapshot.cards.map(toClientCard),
  });
}
