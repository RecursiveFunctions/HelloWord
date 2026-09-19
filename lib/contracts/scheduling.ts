import { z } from "zod";

export const FSRS_DAY_MS = 86_400_000;
/** Stable origin so virtual-clock conversion is reversible. */
export const FSRS_EPOCH_MS = 0;

export const AFactor = z.number().min(0.1).max(5.0);
export type AFactor = z.infer<typeof AFactor>;

export const SchedulerPresetName = z.enum(["normal", "demo", "presentation"]);
export type SchedulerPresetName = z.infer<typeof SchedulerPresetName>;

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

/** Convert wall-clock time into the virtual time ts-fsrs should see. */
export function toFsrsTime(real: Date, dayMs: number): Date {
  const scale = fsrsScale(dayMs);
  return new Date(FSRS_EPOCH_MS + (real.getTime() - FSRS_EPOCH_MS) * scale);
}

/** Convert ts-fsrs virtual time back to wall-clock for persistence and `due <= now()`. */
export function fromFsrsTime(virt: Date, dayMs: number): Date {
  const scale = fsrsScale(dayMs);
  return new Date(FSRS_EPOCH_MS + (virt.getTime() - FSRS_EPOCH_MS) / scale);
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
