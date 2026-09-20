import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MAX_INTERVAL_DAYS, growthFactor, nextReading } from "./schedule";

const NOW = new Date("2026-09-20T12:00:00.000Z");
const NORMAL = { day_ms: 86_400_000 };

describe("reading schedule", () => {
  it("grows the interval faster for less important passages", () => {
    const urgent = nextReading({ interval_days: 1, reps: 0, priority: 0 }, "next", NORMAL, NOW);
    const idle = nextReading({ interval_days: 1, reps: 0, priority: 100 }, "next", NORMAL, NOW);
    assert.equal(urgent.interval_days, 1.4);
    assert.equal(idle.interval_days, 2.4);
    assert.ok(Date.parse(urgent.due) < Date.parse(idle.due));
    assert.equal(urgent.reps, 1);
  });

  it("postpones without counting a reading", () => {
    const outcome = nextReading({ interval_days: 4, reps: 3, priority: 50 }, "postpone", NORMAL, NOW);
    assert.equal(outcome.interval_days, 6);
    assert.equal(outcome.reps, 3);
  });

  it("clamps runaway and nonsense intervals", () => {
    const far = nextReading({ interval_days: 300, reps: 9, priority: 100 }, "next", NORMAL, NOW);
    assert.equal(far.interval_days, MAX_INTERVAL_DAYS);
    const broken = nextReading({ interval_days: Number.NaN, reps: 0, priority: 0 }, "next", NORMAL, NOW);
    assert.equal(broken.interval_days, growthFactor(0));
  });

  it("compresses with the demo clock: one day is one second", () => {
    const outcome = nextReading({ interval_days: 1, reps: 0, priority: 60 }, "next", { day_ms: 1000 }, NOW);
    assert.equal(Date.parse(outcome.due) - NOW.getTime(), 2000);
  });
});
