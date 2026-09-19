import { z } from "zod";
import { ActivityResponse } from "@/lib/contracts/activity";
import { gradeResponse, isSelfRated } from "@/lib/fsrs/grade";
import {
  applyRating,
  emptySchedule,
  humanizeUntil,
  reviewNow,
} from "@/lib/fsrs/engine";
import { getActivity, getProfile, getSchedule } from "@/lib/store/review";
import { invalid, notFound, ok, readJson } from "../../_respond";

export const dynamic = "force-dynamic";

const CheckBody = z.object({
  activityId: z.string().uuid(),
  response: ActivityResponse,
});

/**
 * Reveal the answer without touching the schedule.
 *
 * This exists so the queue can withhold answer keys — a reviewer who can read
 * the correct option out of the page source is not being tested — while still
 * showing the answer before they rate themselves. Nothing here writes: the
 * card only moves when `POST /api/review/grade` runs.
 */
export async function POST(request: Request) {
  const parsed = CheckBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const activity = await getActivity(parsed.data.activityId);
  if (!activity) return notFound("Activity");

  const graded = gradeResponse(activity.payload, parsed.data.response);
  const [profile, existing] = await Promise.all([
    getProfile(),
    getSchedule(activity.id),
  ]);
  const now = reviewNow(profile);
  const current = existing ?? emptySchedule(activity.id, now);

  // What each button would do, so the reviewer rates with the consequence in
  // view. Same code path as the real grade, so the hint cannot drift.
  const intervals = {} as Record<number, string>;
  for (const rating of [1, 2, 3, 4] as const) {
    const { next } = applyRating(current, rating, profile, now);
    intervals[rating] = humanizeUntil(new Date(next.due), now);
  }

  return ok({
    correct: graded.correct,
    suggested: graded.suggested,
    selfRated: isSelfRated(activity.type),
    expected: activity.payload,
    explanation: graded.explanation,
    intervals,
  });
}
