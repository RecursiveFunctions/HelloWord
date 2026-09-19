import { z } from "zod";

export const FSRS_DAY_MS = 86_400_000;

/**
 * Largest absolute millisecond value a JS `Date` can hold (±8.64e15).
 *
 * This is why the virtual clock takes an explicit anchor instead of measuring
 * from 1970: conversion multiplies elapsed time by `fsrsScale(day_ms)`, which
 * is 86_400x under the Demo preset. A 2026 timestamp measured from the Unix
 * epoch lands around 1.5e17 and silently becomes an Invalid Date.
 */
const MAX_DATE_MS = 8.64e15;

export const AFactor = z.number().min(0.1).max(5.0);
export type AFactor = z.infer<typeof AFactor>;

export const SchedulerPresetName = z.enum(["normal", "demo", "presentation"]);
export type SchedulerPresetName = z.infer<typeof SchedulerPresetName>;

/**
 * `learning_steps` and `relearning_steps` are **real-world** durations: `"1s"`
 * under Demo means the card comes back in one actual second. Run them through
 * `toFsrsSteps` before handing them to ts-fsrs, which reads virtual time.
 */
export const SchedulerPreset = z.object({
  name: SchedulerPresetName,
  day_ms: z.number().int().min(250).max(FSRS_DAY_MS),
  learning_steps: z.array(z.string()).min(1),
  relearning_steps: z.array(z.string()).min(1),
  label: z.string(),
  blurb: z.string(),
});
export type SchedulerPreset = z.infer<typeof SchedulerPreset>;

export const SCHEDULER_PRESETS: Record<SchedulerPresetName, SchedulerPreset> = {
  normal: {
    name: "normal",
    day_ms: FSRS_DAY_MS,
    learning_steps: ["1m", "10m"],
    relearning_steps: ["10m"],
    label: "Normal",
    blurb: "Days, weeks, months. The real product.",
  },
  demo: {
    name: "demo",
    day_ms: 1_000,
    learning_steps: ["1s", "5s"],
    relearning_steps: ["5s"],
    label: "Demo",
    blurb: "One FSRS day is one second. A two-week interval lands in fourteen seconds.",
  },
  presentation: {
    name: "presentation",
    day_ms: 60_000,
    learning_steps: ["1m", "2m"],
    relearning_steps: ["1m"],
    label: "Presentation",
    blurb: "One day is one minute. Slow enough to talk over, fast enough that cards reappear.",
  },
};

export const SchedulerProfile = z.object({
  id: z.string().uuid(),
  name: z.string(),
  request_retention: z.number().min(0.7).max(0.98),
  maximum_interval: z.number().int(),
  learning_steps: z.array(z.string()),
  relearning_steps: z.array(z.string()),
  enable_fuzz: z.boolean(),
  interval_modifier: z.number().min(0.01).max(5.0),
  day_ms: z.number().int().min(250).max(FSRS_DAY_MS),
});
export type SchedulerProfile = z.infer<typeof SchedulerProfile>;

/** Scale FSRS's scheduled_days by the global modifier and the card A-factor. */
export function applyIntervalModifiers(
  scheduledDays: number,
  intervalModifier: number,
  aFactor: number,
): number {
  return scheduledDays * intervalModifier * aFactor;
}

export function fsrsScale(dayMs: number): number {
  return FSRS_DAY_MS / dayMs;
}

/**
 * Anchor for virtual-clock conversion. Pass the scheduler profile's
 * `created_at`; any anchor within a few years of now keeps even Demo-preset
 * arithmetic inside `Date`'s range. Both directions must use the same anchor
 * for the conversion to round-trip.
 */
export function clockEpochMs(anchor: string | number | Date): number {
  const ms = anchor instanceof Date ? anchor.getTime() : new Date(anchor).getTime();
  if (!Number.isFinite(ms)) {
    throw new Error(`clockEpochMs: could not parse anchor ${String(anchor)}`);
  }
  return ms;
}

function checkedDate(ms: number, label: string): Date {
  if (!Number.isFinite(ms) || Math.abs(ms) > MAX_DATE_MS) {
    throw new Error(
      `${label}: ${ms} is outside the representable Date range. Anchor the virtual clock nearer to now via clockEpochMs().`,
    );
  }
  return new Date(ms);
}

/** Convert wall-clock time into the virtual time ts-fsrs should see. */
export function toFsrsTime(real: Date, dayMs: number, epochMs: number): Date {
  const scale = fsrsScale(dayMs);
  return checkedDate(epochMs + (real.getTime() - epochMs) * scale, "toFsrsTime");
}

/** Convert ts-fsrs virtual time back to wall-clock for persistence and `due <= now()`. */
export function fromFsrsTime(virt: Date, dayMs: number, epochMs: number): Date {
  const scale = fsrsScale(dayMs);
  return checkedDate(epochMs + (virt.getTime() - epochMs) / scale, "fromFsrsTime");
}

const STEP_UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: FSRS_DAY_MS,
};

/** A step in the only shape ts-fsrs accepts alongside `h` and `d`. */
export type FsrsStep = `${number}m`;

/** Parse one profile step (`"1s"`, `"10m"`, `"2h"`) into real milliseconds. */
export function stepToRealMs(step: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s|m|h|d)$/.exec(step.trim());
  if (!match) {
    throw new Error(`Unrecognised scheduler step "${step}". Use e.g. 1s, 10m, 2h, 1d.`);
  }
  return Number(match[1]) * STEP_UNIT_MS[match[2]];
}

/**
 * Profile steps are real-world durations, but ts-fsrs reads virtual time and its
 * `StepUnit` type only admits `m`, `h`, and `d` — so `"1s"` cannot be handed
 * over as written. Emit virtual minutes instead.
 *
 * Under Normal this is the identity (`"10m"` -> `"10m"`). Under Demo, `"1s"`
 * becomes `"1440m"`: one virtual day, which really does elapse in one second.
 */
export function toFsrsSteps(steps: string[], dayMs: number): FsrsStep[] {
  const scale = fsrsScale(dayMs);
  return steps.map((step): FsrsStep => {
    const minutes = (stepToRealMs(step) * scale) / 60_000;
    if (!(minutes > 0)) {
      throw new Error(
        `Scheduler step "${step}" scales to ${minutes} virtual minutes at day_ms=${dayMs}.`,
      );
    }
    const rounded = Number.isInteger(minutes) ? minutes : Number(minutes.toFixed(4));
    return `${rounded}m`;
  });
}

export function aFactorCopy(aFactor: number): string {
  if (aFactor === 1) return "see this at the normal pace";
  if (aFactor < 1) {
    const times = 1 / aFactor;
    const rounded = Number.isInteger(times) ? String(times) : times.toFixed(1);
    return `see this ${rounded}× more often`;
  }
  const rounded = Number.isInteger(aFactor) ? String(aFactor) : aFactor.toFixed(1);
  return `see this ${rounded}× less often`;
}
