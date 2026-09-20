/**
 * Read and write side of the review loop: activities, their schedules, the
 * scheduler profile, and the `review_event` log.
 *
 * Same two-backend shape as the rest of `lib/store`: Postgres when
 * `DATABASE_URL` is set, an in-memory copy of the seed otherwise, so the review
 * page is demonstrable before Tiger Cloud is wired up.
 */
import { randomUUID } from "node:crypto";
import { dbConfigured, pool, query } from "@/lib/db";
import type { ActivityPayload } from "@/lib/contracts/activity";
import { memory } from "./memory";
import {
  isoString,
  isoStringOrNull,
  type ActivityRow,
  type ReviewEventRow,
  type ScheduleRow,
  type SchedulerProfileRow,
} from "./types";

const ACTIVITY_COLUMNS = `id, note_id, type, payload, source_body_hash, variant_of, created_at`;
const SCHEDULE_COLUMNS = `activity_id, due, stability, difficulty, elapsed_days,
                          scheduled_days, learning_steps, reps, lapses, state,
                          last_review, a_factor`;

function hydrateActivity(row: Record<string, unknown>): ActivityRow {
  return {
    id: String(row.id),
    note_id: String(row.note_id),
    type: row.type as ActivityRow["type"],
    // jsonb arrives parsed from pg, but a text column would not.
    payload: (typeof row.payload === "string"
      ? JSON.parse(row.payload)
      : row.payload) as ActivityPayload,
    source_body_hash: String(row.source_body_hash),
    variant_of: (row.variant_of as string | null) ?? null,
    created_at: isoString(row.created_at),
  };
}

function hydrateSchedule(row: Record<string, unknown>): ScheduleRow {
  return {
    activity_id: String(row.activity_id),
    due: isoString(row.due),
    stability: Number(row.stability),
    difficulty: Number(row.difficulty),
    elapsed_days: Number(row.elapsed_days),
    scheduled_days: Number(row.scheduled_days),
    learning_steps: Number(row.learning_steps),
    reps: Number(row.reps),
    lapses: Number(row.lapses),
    state: Number(row.state),
    last_review: isoStringOrNull(row.last_review),
    a_factor: Number(row.a_factor),
  };
}

export async function listActivities(): Promise<ActivityRow[]> {
  if (dbConfigured()) {
    const rows = await query(`select ${ACTIVITY_COLUMNS} from activity`);
    return rows.map(hydrateActivity);
  }
  return memory().activities;
}

export async function createActivities(
  noteId: string,
  sourceBodyHash: string,
  payloads: ActivityPayload[],
): Promise<ActivityRow[]> {
  if (payloads.length === 0) return [];
  if (dbConfigured() && pool) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      const created: ActivityRow[] = [];
      for (const payload of payloads) {
        const result = await client.query(
          `insert into activity (note_id, type, payload, source_body_hash)
           values ($1, $2, $3::jsonb, $4)
           returning ${ACTIVITY_COLUMNS}`,
          [noteId, payload.type, JSON.stringify(payload), sourceBodyHash],
        );
        created.push(hydrateActivity(result.rows[0]));
      }
      await client.query("commit");
      return created;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }

  const createdAt = new Date().toISOString();
  const created = payloads.map((payload): ActivityRow => ({
    id: randomUUID(),
    note_id: noteId,
    type: payload.type,
    payload,
    source_body_hash: sourceBodyHash,
    variant_of: null,
    created_at: createdAt,
  }));
  memory().activities.push(...created);
  return created;
}

export async function getActivity(id: string): Promise<ActivityRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${ACTIVITY_COLUMNS} from activity where id = $1`,
      [id],
    );
    return rows[0] ? hydrateActivity(rows[0]) : null;
  }
  return memory().activities.find((a) => a.id === id) ?? null;
}

export async function getSchedule(
  activityId: string,
): Promise<ScheduleRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${SCHEDULE_COLUMNS} from schedule where activity_id = $1`,
      [activityId],
    );
    return rows[0] ? hydrateSchedule(rows[0]) : null;
  }
  return memory().schedules.find((s) => s.activity_id === activityId) ?? null;
}

export async function listSchedules(): Promise<ScheduleRow[]> {
  if (dbConfigured()) {
    const rows = await query(`select ${SCHEDULE_COLUMNS} from schedule`);
    return rows.map(hydrateSchedule);
  }
  return memory().schedules;
}

/** Upsert, because a card reviewed for the first time has no schedule row yet. */
export async function saveSchedule(row: ScheduleRow): Promise<ScheduleRow> {
  if (dbConfigured()) {
    const rows = await query(
      `insert into schedule (activity_id, due, stability, difficulty, elapsed_days,
                             scheduled_days, learning_steps, reps, lapses, state,
                             last_review, a_factor)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       on conflict (activity_id) do update set
         due = excluded.due, stability = excluded.stability,
         difficulty = excluded.difficulty, elapsed_days = excluded.elapsed_days,
         scheduled_days = excluded.scheduled_days,
         learning_steps = excluded.learning_steps, reps = excluded.reps,
         lapses = excluded.lapses, state = excluded.state,
         last_review = excluded.last_review, a_factor = excluded.a_factor
       returning ${SCHEDULE_COLUMNS}`,
      [
        row.activity_id,
        row.due,
        row.stability,
        row.difficulty,
        row.elapsed_days,
        row.scheduled_days,
        row.learning_steps,
        row.reps,
        row.lapses,
        row.state,
        row.last_review,
        row.a_factor,
      ],
    );
    return hydrateSchedule(rows[0]);
  }

  const table = memory().schedules;
  const index = table.findIndex((s) => s.activity_id === row.activity_id);
  if (index === -1) table.push(row);
  else table[index] = row;
  return row;
}

export async function setAFactor(
  activityId: string,
  aFactor: number,
): Promise<ScheduleRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `update schedule set a_factor = $2 where activity_id = $1
       returning ${SCHEDULE_COLUMNS}`,
      [activityId, aFactor],
    );
    return rows[0] ? hydrateSchedule(rows[0]) : null;
  }
  const row = memory().schedules.find((s) => s.activity_id === activityId);
  if (!row) return null;
  row.a_factor = aFactor;
  return row;
}

export async function recordReviewEvent(event: ReviewEventRow): Promise<void> {
  if (dbConfigured()) {
    await query(
      `insert into review_event (time, activity_id, note_id, concept_id, rating,
                                 state, elapsed_days, scheduled_days, stability,
                                 difficulty, duration_ms, mode)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [
        event.time,
        event.activity_id,
        event.note_id,
        event.concept_id,
        event.rating,
        event.state,
        event.elapsed_days,
        event.scheduled_days,
        event.stability,
        event.difficulty,
        event.duration_ms,
        event.mode,
      ],
    );
    return;
  }
  memory().reviewEvents.push(event);
}

const PROFILE_COLUMNS = `id, name, request_retention, maximum_interval,
                         learning_steps, relearning_steps, enable_fuzz,
                         interval_modifier, day_ms, clock_offset_ms, created_at`;

function hydrateProfile(row: Record<string, unknown>): SchedulerProfileRow {
  return {
    id: String(row.id),
    name: String(row.name),
    request_retention: Number(row.request_retention),
    maximum_interval: Number(row.maximum_interval),
    learning_steps: row.learning_steps as string[],
    relearning_steps: row.relearning_steps as string[],
    enable_fuzz: Boolean(row.enable_fuzz),
    interval_modifier: Number(row.interval_modifier),
    day_ms: Number(row.day_ms),
    // bigint arrives as a string from pg.
    clock_offset_ms: Number(row.clock_offset_ms ?? 0),
    created_at: isoString(row.created_at),
  };
}

/** There is one profile. `limit 1` rather than an id so callers need no fixture. */
export async function getProfile(): Promise<SchedulerProfileRow> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${PROFILE_COLUMNS} from scheduler_profile order by created_at limit 1`,
    );
    if (rows[0]) return hydrateProfile(rows[0]);
  }
  return memory().profile;
}

export type ProfilePatch = Partial<
  Pick<
    SchedulerProfileRow,
    | "request_retention"
    | "interval_modifier"
    | "day_ms"
    | "learning_steps"
    | "relearning_steps"
    | "clock_offset_ms"
  >
>;

export async function updateProfile(
  patch: ProfilePatch,
): Promise<SchedulerProfileRow> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return getProfile();

  if (dbConfigured()) {
    const current = await getProfile();
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 2}`)
      .join(", ");
    const rows = await query(
      `update scheduler_profile set ${assignments} where id = $1
       returning ${PROFILE_COLUMNS}`,
      [current.id, ...entries.map(([, value]) => value)],
    );
    if (rows[0]) return hydrateProfile(rows[0]);
  }

  Object.assign(memory().profile, Object.fromEntries(entries));
  return memory().profile;
}
