/**
 * The scheduler. ts-fsrs decides the interval; everything here exists to hand
 * it the right clock and to apply the two multipliers it deliberately knows
 * nothing about.
 *
 * Three rules hold the design together:
 *
 * 1. FSRS runs in *virtual* time. Under the Demo preset one FSRS day is one
 *    real second, so a card FSRS puts three days out comes back in three
 *    seconds. We scale time going in and scale the answer back coming out,
 *    which keeps the model mathematically intact instead of faking intervals.
 * 2. The A-factor and the profile's interval modifier are applied *after* FSRS
 *    picks an interval, never by rewriting stability. Writing a user
 *    preference into the memory model corrupts every future prediction.
 * 3. `schedule.due` is always wall-clock, so `where due <= now()` keeps working
 *    and nothing downstream needs to know the clock is compressed.
 */
import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  State,
  type Card,
  type Grade,
  type RecordLogItem,
} from "ts-fsrs";
import {
  applyIntervalModifiers,
  clockEpochMs,
  fromFsrsTime,
  toFsrsTime,
  toFsrsSteps,
  type SchedulerProfile,
} from "@/lib/contracts/scheduling";
import type { Rating } from "@/lib/contracts/activity";
import type { ScheduleRow } from "@/lib/store/types";

/**
 * The time the review system believes it is.
 *
 * `clock_offset_ms` is how "skip ahead" works. Dragging `schedule.due` backward
 * would have been simpler and is the trap the model punishes: FSRS would read
 * the early answer as a successful early recall and inflate stability. Moving
 * the observer forward leaves every interval exactly as FSRS set it.
 */
export function reviewNow(profile: { clock_offset_ms?: number }): Date {
  return new Date(Date.now() + (profile.clock_offset_ms ?? 0));
}

/**
 * Anchor for the virtual clock. Every conversion in a session must use the same
 * one or the round trip stops being reversible, so it is derived from the
 * profile rather than from `Date.now()` at the call site.
 */
export function epochFor(profile: SchedulerProfile & { created_at?: string }): number {
  return clockEpochMs(profile.created_at ?? new Date().toISOString());
}

function paramsFor(profile: SchedulerProfile) {
  return generatorParameters({
    request_retention: profile.request_retention,
    maximum_interval: profile.maximum_interval,
    enable_fuzz: profile.enable_fuzz,
    // Profile steps are real-world durations; ts-fsrs reads virtual time.
    learning_steps: toFsrsSteps(profile.learning_steps, profile.day_ms),
    relearning_steps: toFsrsSteps(profile.relearning_steps, profile.day_ms),
  });
}

/**
 * A card has a memory state only once it has actually been reviewed. Stability
 * zero means FSRS has never run on it, so a row carrying a difficulty but no
 * stability is not a partially-learned card — it is a new one with stale
 * numbers beside it, and ts-fsrs rejects the pair outright.
 */
function neverReviewed(row: ScheduleRow): boolean {
  return row.reps === 0 || row.stability <= 0 || row.last_review === null;
}

/** A stored schedule row as the ts-fsrs `Card` it came from. */
function toCard(row: ScheduleRow, dayMs: number, epochMs: number): Card {
  if (neverReviewed(row)) {
    return {
      ...createEmptyCard(toFsrsTime(new Date(row.due), dayMs, epochMs)),
      // Keep the queue position: a new card that was due an hour ago stays
      // due, it does not jump forward because we rebuilt it.
      due: toFsrsTime(new Date(row.due), dayMs, epochMs),
    };
  }
  return {
    due: toFsrsTime(new Date(row.due), dayMs, epochMs),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    learning_steps: row.learning_steps,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as State,
    last_review: row.last_review
      ? toFsrsTime(new Date(row.last_review), dayMs, epochMs)
      : undefined,
  };
}

export function emptySchedule(activityId: string, now = new Date()): ScheduleRow {
  const card = createEmptyCard(now);
  return {
    activity_id: activityId,
    due: now.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: 0,
    learning_steps: 0,
    reps: 0,
    lapses: 0,
    state: State.New,
    last_review: null,
    a_factor: 1.0,
  };
}

export type Scheduled = {
  next: ScheduleRow;
  /** Straight from ts-fsrs, before our multipliers. Recorded in review_event. */
  log: RecordLogItem["log"];
};

/**
 * Apply one rating and return the row to persist.
 *
 * The interval FSRS chose is stretched by `interval_modifier * a_factor` and
 * then converted back to wall-clock. Learning-state cards are left alone: those
 * intervals are the profile's own learning steps, and multiplying them would
 * mean a card you just failed does not come back when the preset promised.
 */
export function applyRating(
  row: ScheduleRow,
  rating: Rating,
  profile: SchedulerProfile,
  now = new Date(),
): Scheduled {
  const epochMs = epochFor(profile);
  const dayMs = profile.day_ms;
  const engine = fsrs(paramsFor(profile));

  const virtualNow = toFsrsTime(now, dayMs, epochMs);
  const { card, log } = engine.next(
    toCard(row, dayMs, epochMs),
    virtualNow,
    rating as Grade,
  );

  const inReview = card.state === State.Review;
  const stretched = inReview
    ? applyIntervalModifiers(
        card.scheduled_days,
        profile.interval_modifier,
        row.a_factor,
      )
    : card.scheduled_days;

  // Re-derive `due` from the stretched interval rather than trusting the card's
  // own due, which was computed before the multipliers existed.
  const dueVirtual = inReview
    ? new Date(virtualNow.getTime() + stretched * 86_400_000)
    : card.due;

  return {
    log,
    next: {
      activity_id: row.activity_id,
      due: fromFsrsTime(dueVirtual, dayMs, epochMs).toISOString(),
      stability: card.stability,
      difficulty: card.difficulty,
      elapsed_days: card.elapsed_days,
      scheduled_days: Math.round(stretched),
      learning_steps: card.learning_steps,
      reps: card.reps,
      lapses: card.lapses,
      state: card.state,
      last_review: now.toISOString(),
      a_factor: row.a_factor,
    },
  };
}

/**
 * What each button will do, for the interval hints under Again/Hard/Good/Easy.
 * Same maths as `applyRating`, so the hint cannot drift from the outcome.
 */
export function previewIntervals(
  row: ScheduleRow,
  profile: SchedulerProfile,
  now = new Date(),
): Record<Rating, string> {
  const out = {} as Record<Rating, string>;
  for (const rating of [1, 2, 3, 4] as const) {
    const { next } = applyRating(row, rating, profile, now);
    out[rating] = humanizeUntil(new Date(next.due), now);
  }
  return out;
}

/** "3s", "12m", "4d" — the real time until the card returns, not virtual. */
export function humanizeUntil(due: Date, now = new Date()): string {
  const ms = Math.max(0, due.getTime() - now.getTime());
  if (ms < 60_000) return `${Math.max(1, Math.round(ms / 1000))}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  if (ms < 86_400_000) return `${Math.round(ms / 3_600_000)}h`;
  const days = Math.round(ms / 86_400_000);
  if (days < 31) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}
