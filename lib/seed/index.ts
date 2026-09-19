import { SEED_NOW, ids } from "./ids";
import {
  activities,
  concepts,
  extracts,
  notebookItems,
  notebooks,
  notes,
  schedules,
  sources,
  type SeedActivity,
  type SeedNotebook,
  type SeedNote,
  type SeedSchedule,
} from "./data";
import {
  seedReviewDaily,
  seedReviewEvents,
  sparklineForNotebook,
} from "./reviews";

export { ids, SEED_NOW };
export {
  activities,
  conceptExtracts,
  conceptNotes,
  concepts,
  extractNotes,
  extracts,
  notebookItems,
  notebooks,
  notes,
  quizsetActivities,
  quizsets,
  schedulerProfile,
  schedules,
  sources,
} from "./data";
export { seedReviewDaily, seedReviewEvents } from "./reviews";
export { sourceMarkdown } from "./sources";

export function sourceById(id: string) {
  return sources.find((s) => s.id === id);
}

export function noteById(id: string) {
  return notes.find((n) => n.id === id);
}

export function extractById(id: string) {
  return extracts.find((e) => e.id === id);
}

export function activityById(id: string) {
  return activities.find((a) => a.id === id);
}

export function notebookById(id: string) {
  return notebooks.find((n) => n.id === id);
}

export function itemsInNotebook(notebookId: string) {
  return notebookItems.filter((i) => i.notebook_id === notebookId);
}

export function activitiesInNotebook(notebookId: string): SeedActivity[] {
  const idsIn = new Set(
    notebookItems
      .filter((i) => i.notebook_id === notebookId && i.item_type === "activity")
      .map((i) => i.item_id),
  );
  return activities.filter((a) => idsIn.has(a.id));
}

export function dueCount(notebookId: string, now = SEED_NOW): number {
  const acts = new Set(activitiesInNotebook(notebookId).map((a) => a.id));
  return schedules.filter(
    (s) => acts.has(s.activity_id) && new Date(s.due) <= now,
  ).length;
}

export function notebookSparkline(notebook: SeedNotebook): number[] {
  const acts = new Set(activitiesInNotebook(notebook.id).map((a) => a.id));
  return sparklineForNotebook(notebook.id, seedReviewEvents, acts);
}

export type ReviewQueueItem = {
  schedule: SeedSchedule;
  activity: SeedActivity;
  note: SeedNote;
};

export function reviewQueue(now = SEED_NOW): ReviewQueueItem[] {
  const rows: ReviewQueueItem[] = [];
  const due = schedules
    .filter((s) => new Date(s.due) <= now)
    .sort((a, b) => +new Date(a.due) - +new Date(b.due));
  for (const schedule of due) {
    const activity = activityById(schedule.activity_id);
    const note = activity ? noteById(activity.note_id) : undefined;
    if (activity && note) rows.push({ schedule, activity, note });
  }
  return rows;
}

export function isStale(activity: SeedActivity): boolean {
  const note = noteById(activity.note_id);
  return !note || activity.source_body_hash !== note.body_hash;
}

export function diagnosticsForNotebook(notebookId: string) {
  const daily = seedReviewDaily;
  const conceptTotals = new Map<
    string,
    { reviews: number; recalled: number; avg_stability: number }
  >();
  for (const row of daily) {
    const prev = conceptTotals.get(row.concept_id) ?? {
      reviews: 0,
      recalled: 0,
      avg_stability: 0,
    };
    const reviews = prev.reviews + row.reviews;
    conceptTotals.set(row.concept_id, {
      reviews,
      recalled: prev.recalled + row.recalled,
      avg_stability:
        (prev.avg_stability * prev.reviews + row.avg_stability * row.reviews) /
        reviews,
    });
  }

  const struggling: { concept: string; why: string }[] = [];
  const known: string[] = [];
  const untouched: string[] = [];

  for (const concept of concepts) {
    const stats = conceptTotals.get(concept.id);
    if (!stats || stats.reviews === 0) {
      untouched.push(concept.label);
      continue;
    }
    const rate = stats.recalled / stats.reviews;
    if (rate < 0.72 || stats.avg_stability < 2.5) {
      struggling.push({
        concept: concept.label,
        why:
          rate < 0.72
            ? `Recall rate ${(rate * 100).toFixed(0)}% over 90 days.`
            : `Stability still ${stats.avg_stability.toFixed(1)}.`,
      });
    } else {
      known.push(concept.label);
    }
  }

  return {
    struggling,
    known,
    untouched,
    next_action: struggling[0]
      ? `Review ${struggling[0].concept} next — ${struggling[0].why}`
      : "Keep the daily queue moving.",
    due: dueCount(notebookId),
  };
}
