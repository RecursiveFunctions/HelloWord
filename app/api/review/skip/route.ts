import { z } from "zod";
import { queueSnapshot } from "@/lib/fsrs/queue";
import { getProfile, updateProfile } from "@/lib/store/review";
import { fail, ok, readJson } from "../../_respond";

export const dynamic = "force-dynamic";

const SkipBody = z.object({
  notebookIds: z.array(z.string().uuid()).optional(),
  /** Drop back to real time. */
  reset: z.boolean().default(false),
});

/**
 * Jump the review clock forward to the next card.
 *
 * Under the Normal preset a cleared queue can mean "come back tomorrow", which
 * reads as a broken app. This moves the observer rather than the schedule: it
 * advances `clock_offset_ms` to the next due timestamp, so every interval FSRS
 * chose survives intact and `elapsed_days` stays truthful. Pulling due dates
 * backwards instead would look identical and quietly corrupt the model.
 */
export async function POST(request: Request) {
  const parsed = SkipBody.safeParse((await readJson(request)) ?? {});
  if (!parsed.success) return fail("Invalid request body.", 422);

  if (parsed.data.reset) {
    const profile = await updateProfile({ clock_offset_ms: 0 });
    return ok({ offsetMs: 0, skippedMs: 0, nextDue: null, profile });
  }

  const before = await getProfile();
  const snapshot = await queueSnapshot({ notebookIds: parsed.data.notebookIds });

  if (snapshot.cards.length > 0) {
    // Something is already due; skipping would silently drop it.
    return ok({
      offsetMs: before.clock_offset_ms,
      skippedMs: 0,
      nextDue: snapshot.now,
      profile: before,
    });
  }
  if (!snapshot.nextDue) {
    return fail("Nothing is scheduled, so there is nothing to skip to.", 409);
  }

  const skippedMs = Date.parse(snapshot.nextDue) - Date.parse(snapshot.now);
  const profile = await updateProfile({
    clock_offset_ms: before.clock_offset_ms + Math.max(0, skippedMs),
  });

  return ok({
    offsetMs: profile.clock_offset_ms,
    skippedMs: Math.max(0, skippedMs),
    nextDue: snapshot.nextDue,
    profile,
  });
}
