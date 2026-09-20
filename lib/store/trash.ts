/**
 * Recently deleted.
 *
 * `trashItem` stamps `deleted_at` on a row and on whatever depends on it, and
 * every reader in `lib/store` filters on that column, so a trashed row simply
 * stops existing for the rest of the app until `restoreItem` clears it.
 *
 * Dependents take the *same instant* as the row that was deleted, which is how
 * a restore finds exactly what the delete took with it and leaves alone
 * anything that was deleted on its own earlier:
 *
 *   source   -> its extracts -> their activities
 *   note     -> extracts made from it, and activities on it or on those extracts
 *   extract  -> its activities
 *   notebook -> nothing (a notebook references its items, it never owns them)
 *
 * Only rows deleted directly are listed. A cascaded extract is not listed
 * separately, since restoring its source brings it back.
 */
import { dbConfigured, query } from "@/lib/db";
import { deleteCoverBlob } from "./covers";
import { memory } from "./memory";
import {
  isLive,
  isoString,
  type ActivityRow,
  type ExtractRow,
  type NotebookRow,
  type NoteRow,
  type SourceRow,
} from "./types";

export const TRASH_TYPES = [
  "notebook",
  "source",
  "note",
  "extract",
  "activity",
] as const;
export type TrashType = (typeof TRASH_TYPES)[number];

export const TRASH_RETENTION_DAYS = 30;

export type TrashEntry = { deleted_at: string } & (
  | { type: "notebook"; row: NotebookRow }
  | { type: "source"; row: SourceRow }
  | { type: "note"; row: NoteRow }
  | { type: "extract"; row: ExtractRow }
  | { type: "activity"; row: ActivityRow }
);

/** Whole days before a deleted row is purged, never below zero. */
export function daysUntilPurge(deletedAt: string, now = Date.now()): number {
  const expires =
    Date.parse(deletedAt) + TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  return Math.max(0, Math.ceil((expires - now) / (24 * 60 * 60 * 1000)));
}

export function isTrashType(value: string): value is TrashType {
  return (TRASH_TYPES as readonly string[]).includes(value);
}

// Table names come from `TrashType`, never from a request, so interpolating
// them is safe.
const TABLE: Record<TrashType, string> = {
  notebook: "notebook",
  source: "source",
  note: "note",
  extract: "extract",
  activity: "activity",
};

/** Notebook membership rows only ever name these four. */
const MEMBER_TYPES = ["source", "note", "extract", "activity"] as const;

function stampOf(row: { deleted_at?: string | null }): string | null {
  return row.deleted_at ?? null;
}

/* -------------------------------------------------------------------------- */
/* trash                                                                      */
/* -------------------------------------------------------------------------- */

let lastStamp = 0;

/**
 * A restore matches dependents by exact stamp, so two deletes must never share
 * one, even inside the same millisecond.
 */
function nextStamp(): string {
  lastStamp = Math.max(Date.now(), lastStamp + 1);
  return new Date(lastStamp).toISOString();
}

/** Returns false when there is no such live row. */
export async function trashItem(type: TrashType, id: string): Promise<boolean> {
  const stamp = nextStamp();

  if (dbConfigured()) {
    const hit = await query(
      `update ${TABLE[type]} set deleted_at = $2
       where id = $1 and deleted_at is null returning id`,
      [id, stamp],
    );
    if (hit.length === 0) return false;
    await cascadeDb(type, id, stamp, "trash");
    return true;
  }

  const row = findMemoryRow(type, id);
  if (!row || !isLive(row)) return false;
  row.deleted_at = stamp;
  cascadeMemory(type, id, stamp, "trash");
  return true;
}

/** Returns false when there is no such trashed row. */
export async function restoreItem(
  type: TrashType,
  id: string,
): Promise<boolean> {
  if (dbConfigured()) {
    const rows = await query(
      `select deleted_at from ${TABLE[type]}
       where id = $1 and deleted_at is not null`,
      [id],
    );
    if (rows.length === 0) return false;
    const stamp = isoString(rows[0].deleted_at);
    // Dependents first: they are matched through a parent that is still
    // stamped, and the parent's own stamp is what they are matched against.
    await cascadeDb(type, id, stamp, "restore");
    await query(`update ${TABLE[type]} set deleted_at = null where id = $1`, [
      id,
    ]);
    return true;
  }

  const row = findMemoryRow(type, id);
  const stamp = row ? stampOf(row) : null;
  if (!row || !stamp) return false;
  cascadeMemory(type, id, stamp, "restore");
  row.deleted_at = null;
  return true;
}

/* -------------------------------------------------------------------------- */
/* listing and purging                                                        */
/* -------------------------------------------------------------------------- */

/** Everything deleted directly, newest deletion first. */
export async function listTrash(): Promise<TrashEntry[]> {
  const entries: TrashEntry[] = [];

  if (dbConfigured()) {
    const [notebooks, sources, notes, extracts, activities] = await Promise.all([
      query(`select * from notebook where deleted_at is not null`),
      query(`select * from source where deleted_at is not null`),
      query(`select * from note where deleted_at is not null`),
      query(
        `select * from extract e where deleted_at is not null
           and not exists (select 1 from source s
                            where s.id = e.source_id and s.deleted_at is not null)
           and not exists (select 1 from note n
                            where n.id = e.note_id and n.deleted_at is not null)`,
      ),
      query(
        `select * from activity a where deleted_at is not null
           and not exists (select 1 from note n
                            where n.id = a.note_id and n.deleted_at is not null)
           and not exists (select 1 from extract e
                            where e.id = a.extract_id and e.deleted_at is not null)`,
      ),
    ]);
    const push = (type: TrashType, rows: Record<string, unknown>[]) => {
      for (const row of rows) {
        entries.push({
          type,
          row: dbRow(type, row),
          deleted_at: isoString(row.deleted_at),
        } as TrashEntry);
      }
    };
    push("notebook", notebooks);
    push("source", sources);
    push("note", notes);
    push("extract", extracts);
    push("activity", activities);
  } else {
    const tables = memory();
    const trashedSources = new Set(
      tables.sources.filter((r) => !isLive(r)).map((r) => r.id),
    );
    const trashedNotes = new Set(
      tables.notes.filter((r) => !isLive(r)).map((r) => r.id),
    );
    const trashedExtracts = new Set(
      tables.extracts.filter((r) => !isLive(r)).map((r) => r.id),
    );
    const add = (type: TrashType, row: { deleted_at?: string | null }) =>
      entries.push({
        type,
        row,
        deleted_at: row.deleted_at as string,
      } as TrashEntry);

    tables.notebooks.filter((r) => !isLive(r)).forEach((r) => add("notebook", r));
    tables.sources.filter((r) => !isLive(r)).forEach((r) => add("source", r));
    tables.notes.filter((r) => !isLive(r)).forEach((r) => add("note", r));
    tables.extracts
      .filter(
        (r) =>
          !isLive(r) &&
          !(r.source_id && trashedSources.has(r.source_id)) &&
          !(r.note_id && trashedNotes.has(r.note_id)),
      )
      .forEach((r) => add("extract", r));
    tables.activities
      .filter(
        (r) =>
          !isLive(r) &&
          !(r.note_id && trashedNotes.has(r.note_id)) &&
          !(r.extract_id && trashedExtracts.has(r.extract_id)),
      )
      .forEach((r) => add("activity", r));
  }

  return entries.sort(
    (a, b) => Date.parse(b.deleted_at) - Date.parse(a.deleted_at),
  );
}

export async function purgeItem(type: TrashType, id: string): Promise<boolean> {
  const removed = await collectDescendants(type, id);

  if (dbConfigured()) {
    const gone = await query(
      `delete from ${TABLE[type]}
       where id = $1 and deleted_at is not null returning id`,
      [id],
    );
    if (gone.length === 0) return false;
    if (type === "notebook") deleteCoverBlob(id);
    await dropMemberships(removed);
    return true;
  }

  const row = findMemoryRow(type, id);
  if (!row || isLive(row)) return false;
  purgeMemory(removed);
  if (type === "notebook") deleteCoverBlob(id);
  return true;
}

export async function emptyTrash(): Promise<number> {
  const entries = await listTrash();
  let count = 0;
  for (const entry of entries) {
    if (await purgeItem(entry.type, entry.row.id)) count += 1;
  }
  return count;
}

/** Called whenever the trash is read, so nothing needs a scheduler. */
export async function purgeExpired(now = new Date()): Promise<number> {
  const cutoff = now.getTime() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const entries = await listTrash();
  let count = 0;
  for (const entry of entries) {
    if (Date.parse(entry.deleted_at) >= cutoff) continue;
    if (await purgeItem(entry.type, entry.row.id)) count += 1;
  }
  return count;
}

/* -------------------------------------------------------------------------- */
/* postgres                                                                   */
/* -------------------------------------------------------------------------- */

function dbRow(type: TrashType, row: Record<string, unknown>) {
  // The list screens only read the columns the typed stores expose, so a
  // `select *` row is handed over with timestamps normalised.
  const out: Record<string, unknown> = { ...row };
  for (const key of ["created_at", "updated_at", "deleted_at", "queue_due"]) {
    if (out[key] !== undefined && out[key] !== null) out[key] = isoString(out[key]);
  }
  if (type === "extract" && !Array.isArray(out.suggestion_concepts)) {
    out.suggestion_concepts = [];
  }
  return out;
}

/**
 * `mode` trash stamps dependents that are still live; `restore` clears the ones
 * carrying the parent's stamp. Activities go before their extracts on the way
 * in so the subquery still sees live extracts.
 */
async function cascadeDb(
  type: TrashType,
  id: string,
  stamp: string,
  mode: "trash" | "restore",
): Promise<void> {
  const set = mode === "trash" ? "$2" : "null";
  const match = mode === "trash" ? "deleted_at is null" : "deleted_at = $2";
  const activity = (where: string) =>
    query(`update activity set deleted_at = ${set} where ${match} and ${where}`, [
      id,
      stamp,
    ]);
  const extract = (where: string) =>
    query(`update extract set deleted_at = ${set} where ${match} and ${where}`, [
      id,
      stamp,
    ]);

  if (type === "source") {
    await activity(
      `extract_id in (select id from extract where source_id = $1)`,
    );
    await extract(`source_id = $1`);
  } else if (type === "note") {
    await activity(
      `(note_id = $1 or extract_id in (select id from extract where note_id = $1))`,
    );
    await extract(`note_id = $1`);
  } else if (type === "extract") {
    await activity(`extract_id = $1`);
  }
}

async function collectDescendants(
  type: TrashType,
  id: string,
): Promise<{ type: TrashType; id: string }[]> {
  const found: { type: TrashType; id: string }[] = [{ type, id }];

  if (dbConfigured()) {
    const ids = async (sql: string) =>
      (await query(sql, [id])).map((row) => String(row.id));
    let extractIds: string[] = [];
    if (type === "source") {
      extractIds = await ids(`select id from extract where source_id = $1`);
    } else if (type === "note") {
      extractIds = await ids(`select id from extract where note_id = $1`);
    } else if (type === "extract") {
      extractIds = [id];
    }
    extractIds
      .filter((extractId) => extractId !== id)
      .forEach((extractId) => found.push({ type: "extract", id: extractId }));

    const activityIds =
      type === "activity"
        ? []
        : (
            await query(
              `select id from activity
               where extract_id = any($1::uuid[]) ${type === "note" ? "or note_id = $2" : ""}`,
              type === "note" ? [extractIds, id] : [extractIds],
            )
          ).map((row) => String(row.id));
    activityIds.forEach((activityId) =>
      found.push({ type: "activity", id: activityId }),
    );
    return found;
  }

  const tables = memory();
  const extractIds =
    type === "source"
      ? tables.extracts.filter((r) => r.source_id === id).map((r) => r.id)
      : type === "note"
        ? tables.extracts.filter((r) => r.note_id === id).map((r) => r.id)
        : type === "extract"
          ? [id]
          : [];
  extractIds
    .filter((extractId) => extractId !== id)
    .forEach((extractId) => found.push({ type: "extract", id: extractId }));
  if (type !== "activity") {
    tables.activities
      .filter(
        (r) =>
          (r.extract_id && extractIds.includes(r.extract_id)) ||
          (type === "note" && r.note_id === id),
      )
      .forEach((r) => found.push({ type: "activity", id: r.id }));
  }
  return found;
}

/** `notebook_item` has no foreign key, so purged rows must be swept by hand. */
async function dropMemberships(
  removed: { type: TrashType; id: string }[],
): Promise<void> {
  for (const memberType of MEMBER_TYPES) {
    const ids = removed.filter((r) => r.type === memberType).map((r) => r.id);
    if (ids.length === 0) continue;
    await query(
      `delete from notebook_item
       where item_type = $1 and item_id = any($2::uuid[])`,
      [memberType, ids],
    );
  }
}

/* -------------------------------------------------------------------------- */
/* memory backend                                                             */
/* -------------------------------------------------------------------------- */

type Stamped = { id: string; deleted_at?: string | null };

function findMemoryRow(type: TrashType, id: string): Stamped | undefined {
  const tables = memory();
  const rows: Stamped[] =
    type === "notebook"
      ? tables.notebooks
      : type === "source"
        ? tables.sources
        : type === "note"
          ? tables.notes
          : type === "extract"
            ? tables.extracts
            : tables.activities;
  return rows.find((row) => row.id === id);
}

function cascadeMemory(
  type: TrashType,
  id: string,
  stamp: string,
  mode: "trash" | "restore",
): void {
  const tables = memory();
  const apply = (row: Stamped) => {
    if (mode === "trash") {
      if (isLive(row)) row.deleted_at = stamp;
    } else if (row.deleted_at === stamp) {
      row.deleted_at = null;
    }
  };

  if (type === "source" || type === "note") {
    const extracts = tables.extracts.filter((row) =>
      type === "source" ? row.source_id === id : row.note_id === id,
    );
    const extractIds = new Set(extracts.map((row) => row.id));
    tables.activities
      .filter(
        (row) =>
          (row.extract_id && extractIds.has(row.extract_id)) ||
          (type === "note" && row.note_id === id),
      )
      .forEach(apply);
    extracts.forEach(apply);
  } else if (type === "extract") {
    tables.activities.filter((row) => row.extract_id === id).forEach(apply);
  }
}

function purgeMemory(removed: { type: TrashType; id: string }[]): void {
  const tables = memory();
  const ids = (type: TrashType) =>
    new Set(removed.filter((r) => r.type === type).map((r) => r.id));
  const notebooks = ids("notebook");
  const sources = ids("source");
  const notes = ids("note");
  const extracts = ids("extract");
  const activities = ids("activity");

  tables.notebooks = tables.notebooks.filter((r) => !notebooks.has(r.id));
  tables.sources = tables.sources.filter((r) => !sources.has(r.id));
  tables.notes = tables.notes.filter((r) => !notes.has(r.id));
  tables.extracts = tables.extracts.filter((r) => !extracts.has(r.id));
  tables.activities = tables.activities.filter((r) => !activities.has(r.id));
  tables.schedules = tables.schedules.filter(
    (r) => !activities.has(r.activity_id),
  );
  tables.extractNotes = tables.extractNotes.filter(
    (r) => !extracts.has(r.extract_id) && !notes.has(r.note_id),
  );
  tables.conceptNotes = tables.conceptNotes.filter((r) => !notes.has(r.note_id));
  tables.conceptExtracts = tables.conceptExtracts.filter(
    (r) => !extracts.has(r.extract_id),
  );
  tables.distillDrafts = tables.distillDrafts.filter(
    (r) => !extracts.has(r.extract_id),
  );
  tables.notebookItems = tables.notebookItems.filter(
    (r) =>
      !(
        (notebooks.has(r.notebook_id)) ||
        (r.item_type === "source" && sources.has(r.item_id)) ||
        (r.item_type === "note" && notes.has(r.item_id)) ||
        (r.item_type === "extract" && extracts.has(r.item_id)) ||
        (r.item_type === "activity" && activities.has(r.item_id))
      ),
  );
}
