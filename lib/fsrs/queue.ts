/**
 * Building the due queue.
 *
 * "Due" is a wall-clock comparison against `schedule.due`, which is why the
 * virtual clock never leaks out of `engine.ts`: compressing the clock changes
 * how fast cards become due, not how dueness is decided.
 */
import { getProfile, listActivities, listSchedules } from "@/lib/store/review";
import { listNotebookItems, listNotebooks } from "@/lib/store/notebooks";
import { listNotesByIds } from "@/lib/store/notes";
import { emptySchedule, reviewNow } from "./engine";
import type { ActivityRow, ScheduleRow } from "@/lib/store/types";

/** Wall clock plus whatever the reviewer has skipped ahead by. */
async function resolveNow(explicit?: Date): Promise<Date> {
  return explicit ?? reviewNow(await getProfile());
}

export type QueueCard = {
  activity: ActivityRow;
  schedule: ScheduleRow;
  noteId: string;
  noteTitle: string;
  /** The note has been edited since this question was generated. */
  stale: boolean;
};

/** Everything a renderer needs, with the answer key removed. */
export type ClientCard = {
  activityId: string;
  type: ActivityRow["type"];
  prompt: ClientPrompt;
  noteId: string;
  noteTitle: string;
  stale: boolean;
  due: string;
  aFactor: number;
  reps: number;
  lapses: number;
  state: number;
};

export type ClientPrompt =
  | { type: "mcq"; stem: string; options: string[] }
  | { type: "select_all"; stem: string; options: string[] }
  | {
      type: "fill_blank";
      template: string;
      blanks: { id: number; hint?: string }[];
    }
  | { type: "closed"; stem: string; hint?: string };

/**
 * A reviewer who can read the correct option out of the page source is not
 * being tested, so the answer key never leaves the server. `POST
 * /api/review/check` is the only thing that reveals it.
 */
export function toClientCard(card: QueueCard): ClientCard {
  const payload = card.activity.payload;
  const prompt: ClientPrompt =
    payload.type === "fill_blank"
      ? {
          type: "fill_blank",
          template: payload.template,
          blanks: payload.blanks.map((b) => ({ id: b.id, hint: b.hint })),
        }
      : payload.type === "closed"
        ? { type: "closed", stem: payload.stem, hint: payload.hint }
        : {
            type: payload.type,
            stem: payload.stem,
            options: payload.options,
          };

  return {
    activityId: card.activity.id,
    type: card.activity.type,
    prompt,
    noteId: card.noteId,
    noteTitle: card.noteTitle,
    stale: card.stale,
    due: card.schedule.due,
    aFactor: card.schedule.a_factor,
    reps: card.schedule.reps,
    lapses: card.schedule.lapses,
    state: card.schedule.state,
  };
}

async function noteTitles(ids: string[]): Promise<Map<string, string>> {
  const out = new Map(
    (await listNotesByIds(ids)).map((note) => [note.id, note.title]),
  );
  for (const id of ids) if (!out.has(id)) out.set(id, "Untitled note");
  return out;
}

async function noteHashes(ids: string[]): Promise<Map<string, string>> {
  return new Map(
    (await listNotesByIds(ids)).map((note) => [note.id, note.body_hash]),
  );
}

/**
 * Which activities a notebook contains.
 *
 * Membership counts two ways: the activity itself was added, or its parent note
 * was. A user who drags a note into a notebook means "test me on this", and
 * would be surprised to find the notebook's review queue empty.
 */
async function activityIdsIn(
  notebookId: string,
  all: ActivityRow[],
): Promise<Set<string>> {
  const items = await listNotebookItems(notebookId);
  const direct = new Set(
    items.filter((i) => i.item_type === "activity").map((i) => i.item_id),
  );
  const noteIds = new Set(
    items.filter((i) => i.item_type === "note").map((i) => i.item_id),
  );
  for (const activity of all) {
    if (noteIds.has(activity.note_id)) direct.add(activity.id);
  }
  return direct;
}

/** Union across a selection. A card in two selected notebooks is served once. */
async function activityIdsInAny(
  notebookIds: string[],
  all: ActivityRow[],
): Promise<Set<string>> {
  const union = new Set<string>();
  for (const id of notebookIds) {
    for (const activityId of await activityIdsIn(id, all)) union.add(activityId);
  }
  return union;
}

export type QueueOptions = {
  /**
   * Notebooks to draw from. Omit for everything, which is what the page opens
   * on; an empty array is an explicit "nothing selected" and yields no cards.
   */
  notebookIds?: string[];
  now?: Date;
  limit?: number;
};

export async function dueQueue(options: QueueOptions = {}): Promise<QueueCard[]> {
  return (await queueSnapshot(options)).cards;
}

/**
 * The due cards plus the moment the next one arrives.
 *
 * `nextDue` is what turns an empty queue from a dead end into a wait with a
 * number on it — and into something "skip ahead" can jump to.
 */
export async function queueSnapshot(
  options: QueueOptions = {},
): Promise<{ cards: QueueCard[]; nextDue: string | null; now: string }> {
  const now = await resolveNow(options.now);
  const [activities, schedules] = await Promise.all([
    listActivities(),
    listSchedules(),
  ]);

  const nowIso = now.toISOString();
  const { notebookIds } = options;
  let scoped = activities;
  if (notebookIds) {
    if (notebookIds.length === 0) {
      return { cards: [], nextDue: null, now: nowIso };
    }
    const ids = await activityIdsInAny(notebookIds, activities);
    scoped = activities.filter((a) => ids.has(a.id));
  }

  const byActivity = new Map(schedules.map((s) => [s.activity_id, s]));

  const withSchedules = scoped
    // A generated activity that has never been scheduled is due immediately;
    // that is what makes new cards appear without a backfill job.
    .map((activity) => ({
      activity,
      schedule: byActivity.get(activity.id) ?? emptySchedule(activity.id, now),
    }));

  const due = withSchedules
    .filter(({ schedule }) => new Date(schedule.due) <= now)
    .sort((a, b) => Date.parse(a.schedule.due) - Date.parse(b.schedule.due));

  const nextDue = withSchedules
    .map(({ schedule }) => schedule.due)
    .filter((iso) => new Date(iso) > now)
    .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null;

  const noteIds = [...new Set(due.map((d) => d.activity.note_id))];
  const [titles, hashes] = await Promise.all([
    noteTitles(noteIds),
    noteHashes(noteIds),
  ]);

  const cards = due.map(({ activity, schedule }) => ({
    activity,
    schedule,
    noteId: activity.note_id,
    noteTitle: titles.get(activity.note_id) ?? "Untitled note",
    stale: hashes.get(activity.note_id) !== activity.source_body_hash,
  }));

  return {
    cards: options.limit ? cards.slice(0, options.limit) : cards,
    nextDue,
    now: nowIso,
  };
}

/**
 * Due counts for the global chip and each notebook chip, in one pass so the
 * page does not issue a query per notebook.
 */
export async function dueCounts(
  explicitNow?: Date,
): Promise<{ total: number; byNotebook: Record<string, number> }> {
  const [now, activities, schedules, notebooks] = await Promise.all([
    resolveNow(explicitNow),
    listActivities(),
    listSchedules(),
    listNotebooks(),
  ]);

  const byActivity = new Map(schedules.map((s) => [s.activity_id, s]));
  const isDue = (activity: ActivityRow) => {
    const schedule = byActivity.get(activity.id);
    return !schedule || new Date(schedule.due) <= now;
  };
  const dueIds = new Set(activities.filter(isDue).map((a) => a.id));

  const byNotebook: Record<string, number> = {};
  for (const notebook of notebooks) {
    const scoped = await activityIdsIn(notebook.id, activities);
    let count = 0;
    for (const id of scoped) if (dueIds.has(id)) count += 1;
    byNotebook[notebook.id] = count;
  }

  return { total: dueIds.size, byNotebook };
}
