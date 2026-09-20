/**
 * Scheduling for the incremental reading queue.
 *
 * Not FSRS. FSRS predicts recall from a grade, and re-reading a passage has no
 * grade to give it, so feeding it a made-up "Good" would be inventing data.
 * This is SuperMemo's topic rule instead: every showing multiplies the
 * interval, and priority decides how hard. A priority-0 passage comes back
 * soonest; a priority-100 one drifts away fastest.
 *
 * `due` is wall-clock, exactly like `schedule.due`. The virtual clock enters
 * only through `day_ms` (how long one reading "day" really lasts) and through
 * the `now` the caller passes, which should be `reviewNow(profile)` so that
 * skip-ahead moves the reading queue along with the review queue.
 */

export const MIN_INTERVAL_DAYS = 1;
export const MAX_INTERVAL_DAYS = 365;

/** Postponing is "not now", not "less important": a flat push, no rep. */
const POSTPONE_FACTOR = 1.5;

export type ReadingState = {
  interval_days: number;
  reps: number;
  priority: number;
};

export type ReadingAction = "next" | "postpone";

export type ReadingOutcome = {
  interval_days: number;
  reps: number;
  due: string;
};

function clamp(days: number): number {
  if (!Number.isFinite(days)) return MIN_INTERVAL_DAYS;
  return Math.min(MAX_INTERVAL_DAYS, Math.max(MIN_INTERVAL_DAYS, days));
}

/** 1.4x at priority 0 up to 2.4x at priority 100. */
export function growthFactor(priority: number): number {
  const bounded = Math.min(100, Math.max(0, priority));
  return 1.4 + bounded / 100;
}

export function nextReading(
  row: ReadingState,
  action: ReadingAction,
  profile: { day_ms: number },
  now: Date,
): ReadingOutcome {
  const current = clamp(row.interval_days);
  const interval_days =
    action === "next"
      ? clamp(current * growthFactor(row.priority))
      : clamp(current * POSTPONE_FACTOR);

  return {
    interval_days,
    reps: action === "next" ? row.reps + 1 : row.reps,
    due: new Date(now.getTime() + interval_days * profile.day_ms).toISOString(),
  };
}
