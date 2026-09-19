import { ids, SEED_NOW } from "./ids";
import { activities, conceptNotes } from "./data";

export type SeedReviewEvent = {
  time: string;
  activity_id: string;
  note_id: string;
  concept_id: string | null;
  rating: 1 | 2 | 3 | 4;
  state: number;
  elapsed_days: number;
  scheduled_days: number;
  stability: number;
  difficulty: number;
  duration_ms: number;
  mode: "queue" | "quiz";
};

export type SeedReviewDaily = {
  bucket: string;
  concept_id: string;
  reviews: number;
  recalled: number;
  avg_stability: number;
  avg_difficulty: number;
  avg_duration_ms: number;
};

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const conceptByNote = new Map<string, string[]>();
for (const row of conceptNotes) {
  const list = conceptByNote.get(row.note_id) ?? [];
  list.push(row.concept_id);
  conceptByNote.set(row.note_id, list);
}

/** Ninety days of synthetic reviews, deterministic from SEED_NOW. */
export function generateReviewEvents(): SeedReviewEvent[] {
  const rand = mulberry32(20260919);
  const events: SeedReviewEvent[] = [];
  const dayMs = 86_400_000;

  for (let day = 89; day >= 0; day--) {
    const progress = (89 - day) / 89;
    const reviewsToday = 4 + Math.floor(rand() * 5);
    for (let i = 0; i < reviewsToday; i++) {
      const activity = activities[Math.floor(rand() * activities.length)];
      const concepts = conceptByNote.get(activity.note_id) ?? [];
      const concept_id = concepts.length
        ? concepts[Math.floor(rand() * concepts.length)]
        : null;
      const roll = rand();
      let rating: 1 | 2 | 3 | 4;
      if (roll < 0.12 - progress * 0.06) rating = 1;
      else if (roll < 0.32 - progress * 0.08) rating = 2;
      else if (roll < 0.78) rating = 3;
      else rating = 4;

      const time = new Date(
        SEED_NOW.getTime() -
          day * dayMs +
          Math.floor(rand() * 14 * 3_600_000) +
          8 * 3_600_000,
      );
      events.push({
        time: time.toISOString(),
        activity_id: activity.id,
        note_id: activity.note_id,
        concept_id,
        rating,
        state: 2,
        elapsed_days: 1 + Math.floor((89 - day) / 12),
        scheduled_days: 1 + Math.floor((89 - day) / 10),
        stability: 0.8 + progress * 6 + rand(),
        difficulty: Math.max(1.2, 6.4 - progress * 2.5 + rand() * 0.4),
        duration_ms: 3500 + Math.floor(rand() * 14000),
        mode: rand() > 0.85 ? "quiz" : "queue",
      });
    }
  }
  return events;
}

export function rollupDaily(events: SeedReviewEvent[]): SeedReviewDaily[] {
  const buckets = new Map<string, SeedReviewEvent[]>();
  for (const event of events) {
    if (!event.concept_id) continue;
    const bucket = event.time.slice(0, 10);
    const key = `${bucket}|${event.concept_id}`;
    const list = buckets.get(key) ?? [];
    list.push(event);
    buckets.set(key, list);
  }
  return [...buckets.entries()].map(([key, list]) => {
    const [bucket, concept_id] = key.split("|");
    const recalled = list.filter((e) => e.rating >= 2).length;
    const sum = (pick: (e: SeedReviewEvent) => number) =>
      list.reduce((acc, e) => acc + pick(e), 0);
    return {
      bucket,
      concept_id,
      reviews: list.length,
      recalled,
      avg_stability: sum((e) => e.stability) / list.length,
      avg_difficulty: sum((e) => e.difficulty) / list.length,
      avg_duration_ms: sum((e) => e.duration_ms) / list.length,
    };
  });
}

export function sparklineForNotebook(
  notebookId: string,
  events: SeedReviewEvent[],
  activityIds: Set<string>,
): number[] {
  void notebookId;
  const counts = Array.from({ length: 90 }, () => 0);
  const start = SEED_NOW.getTime() - 89 * 86_400_000;
  for (const event of events) {
    if (!activityIds.has(event.activity_id)) continue;
    const day = Math.floor((new Date(event.time).getTime() - start) / 86_400_000);
    if (day >= 0 && day < 90) counts[day] += 1;
  }
  return counts;
}

export const seedReviewEvents = generateReviewEvents();
export const seedReviewDaily = rollupDaily(seedReviewEvents);
