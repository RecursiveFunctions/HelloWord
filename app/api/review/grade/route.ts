import { GradeBody } from "@/lib/api";
import {
  applyRating,
  emptySchedule,
  humanizeUntil,
  reviewNow,
} from "@/lib/fsrs/engine";
import { gradeResponse } from "@/lib/fsrs/grade";
import { conceptNotes } from "@/lib/seed";
import {
  getActivity,
  getProfile,
  getSchedule,
  recordReviewEvent,
  saveSchedule,
} from "@/lib/store/review";
import { invalid, notFound, ok, readJson } from "../../_respond";

export const dynamic = "force-dynamic";

/**
 * Grade one answer and advance the card.
 *
 * Correctness and the FSRS rating are deliberately separate. The reviewer's own
 * Again/Hard/Good/Easy press is what FSRS consumes, because only they know
 * whether a right answer was effortless or barely dragged up. When no rating
 * is sent — a flashcard graded in bulk, or the voice examiner — we fall back to
 * a binary derived from correctness rather than inventing a Hard or an Easy.
 */
export async function POST(request: Request) {
  const parsed = GradeBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { activityId, response, rating, mode, durationMs } = parsed.data;

  const activity = await getActivity(activityId);
  if (!activity) return notFound("Activity");

  const graded = gradeResponse(activity.payload, response);
  const effective = rating ?? graded.suggested;

  const [profile, existing] = await Promise.all([
    getProfile(),
    getSchedule(activityId),
  ]);
  // Skipped-ahead time counts as real time here, or a card reviewed after a
  // skip would be rescheduled from a moment that already passed.
  const now = reviewNow(profile);
  const current = existing ?? emptySchedule(activityId, now);

  const { next, log } = applyRating(current, effective, profile, now);
  await saveSchedule(next);

  // One concept per event keeps the hypertable rollup simple; a note with
  // several concepts contributes to whichever is listed first.
  const concept = conceptNotes.find((c) => c.note_id === activity.note_id);
  await recordReviewEvent({
    time: now.toISOString(),
    activity_id: activityId,
    note_id: activity.note_id,
    concept_id: concept?.concept_id ?? null,
    rating: effective,
    state: log.state,
    elapsed_days: log.elapsed_days,
    scheduled_days: next.scheduled_days,
    stability: next.stability,
    difficulty: next.difficulty,
    duration_ms: durationMs ?? null,
    mode,
  });

  return ok({
    correct: graded.correct,
    rating: effective,
    expected: activity.payload,
    explanation: graded.explanation,
    nextDue: next.due,
    // Real seconds until it returns, which under Demo is the whole point.
    nextIn: humanizeUntil(new Date(next.due), now),
    reps: next.reps,
    lapses: next.lapses,
  });
}
