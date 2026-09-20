import { dbConfigured, query } from "@/lib/db";
import { deleteCoverBlob } from "./covers";
import { memory } from "./memory";
import {
  isoString,
  type NotebookItemRow,
  type NotebookItemType,
  type NotebookRow,
} from "./types";

const COLUMNS = `id, name, description, color, cover_storage_key, created_at`;

function hydrate(row: Record<string, unknown>): NotebookRow {
  return {
    id: String(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    color: (row.color as string | null) ?? null,
    cover_storage_key: (row.cover_storage_key as string | null) ?? null,
    created_at: isoString(row.created_at),
  };
}

function hydrateItem(row: Record<string, unknown>): NotebookItemRow {
  return {
    notebook_id: String(row.notebook_id),
    item_type: row.item_type as NotebookItemType,
    item_id: String(row.item_id),
    added_at: isoString(row.added_at),
  };
}

export async function listNotebooks(): Promise<NotebookRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from notebook order by created_at asc`,
    );
    return rows.map(hydrate);
  }
  return [...memory().notebooks].sort(
    (a, b) => Date.parse(a.created_at) - Date.parse(b.created_at),
  );
}

export async function getNotebook(id: string): Promise<NotebookRow | null> {
  if (dbConfigured()) {
    const rows = await query(`select ${COLUMNS} from notebook where id = $1`, [
      id,
    ]);
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return memory().notebooks.find((notebook) => notebook.id === id) ?? null;
}

export async function createNotebook(input: {
  name: string;
  description?: string | null;
  color?: string | null;
  cover_storage_key?: string | null;
}): Promise<NotebookRow> {
  if (dbConfigured()) {
    const rows = await query(
      `insert into notebook (name, description, color, cover_storage_key)
       values ($1, $2, $3, $4) returning ${COLUMNS}`,
      [
        input.name,
        input.description ?? null,
        input.color ?? null,
        input.cover_storage_key ?? null,
      ],
    );
    return hydrate(rows[0]);
  }

  const row: NotebookRow = {
    id: crypto.randomUUID(),
    name: input.name,
    description: input.description ?? null,
    color: input.color ?? null,
    cover_storage_key: input.cover_storage_key ?? null,
    created_at: new Date().toISOString(),
  };
  memory().notebooks.push(row);
  return row;
}

export async function updateNotebook(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    color?: string | null;
    cover_storage_key?: string | null;
  },
): Promise<NotebookRow | null> {
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return getNotebook(id);

  if (dbConfigured()) {
    const assignments = entries
      .map(([column], index) => `${column} = $${index + 2}`)
      .join(", ");
    const rows = await query(
      `update notebook set ${assignments} where id = $1 returning ${COLUMNS}`,
      [id, ...entries.map(([, value]) => value)],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }

  const row = memory().notebooks.find((notebook) => notebook.id === id);
  if (!row) return null;
  Object.assign(row, Object.fromEntries(entries));
  return row;
}

export async function deleteNotebook(id: string): Promise<boolean> {
  if (dbConfigured()) {
    const rows = await query(`delete from notebook where id = $1 returning id`, [
      id,
    ]);
    if (rows.length === 0) return false;
    deleteCoverBlob(id);
    return true;
  }

  const tables = memory();
  const index = tables.notebooks.findIndex((notebook) => notebook.id === id);
  if (index === -1) return false;
  tables.notebooks.splice(index, 1);
  tables.notebookItems = tables.notebookItems.filter(
    (item) => item.notebook_id !== id,
  );
  deleteCoverBlob(id);
  return true;
}

export async function listNotebookItems(
  notebookId: string,
): Promise<NotebookItemRow[]> {
  if (dbConfigured()) {
    const rows = await query(
      `select notebook_id, item_type, item_id, added_at
       from notebook_item where notebook_id = $1 order by added_at desc`,
      [notebookId],
    );
    return rows.map(hydrateItem);
  }
  return memory()
    .notebookItems.filter((item) => item.notebook_id === notebookId)
    .sort((a, b) => Date.parse(b.added_at) - Date.parse(a.added_at));
}

/**
 * `notebook_item` is polymorphic and has no foreign key, which is what lets the
 * Library read a notebook's contents in one query. The plan's trade is that the
 * API layer enforces the reference instead — see `app/api/notebooks/[id]/items`.
 */
export async function addNotebookItems(
  notebookId: string,
  items: { item_type: NotebookItemType; item_id: string }[],
): Promise<NotebookItemRow[]> {
  if (items.length === 0) return [];

  if (dbConfigured()) {
    const values = items
      .map((_, i) => `($1, $${i * 2 + 2}, $${i * 2 + 3})`)
      .join(", ");
    const rows = await query(
      `insert into notebook_item (notebook_id, item_type, item_id)
       values ${values}
       on conflict (notebook_id, item_type, item_id) do nothing
       returning notebook_id, item_type, item_id, added_at`,
      [notebookId, ...items.flatMap((i) => [i.item_type, i.item_id])],
    );
    return rows.map(hydrateItem);
  }

  const tables = memory();
  const added: NotebookItemRow[] = [];
  for (const item of items) {
    const exists = tables.notebookItems.some(
      (existing) =>
        existing.notebook_id === notebookId &&
        existing.item_type === item.item_type &&
        existing.item_id === item.item_id,
    );
    if (exists) continue;
    const row: NotebookItemRow = {
      notebook_id: notebookId,
      item_type: item.item_type,
      item_id: item.item_id,
      added_at: new Date().toISOString(),
    };
    tables.notebookItems.push(row);
    added.push(row);
  }
  return added;
}

export async function removeNotebookItem(
  notebookId: string,
  itemType: NotebookItemType,
  itemId: string,
): Promise<boolean> {
  if (dbConfigured()) {
    const rows = await query(
      `delete from notebook_item
       where notebook_id = $1 and item_type = $2 and item_id = $3
       returning item_id`,
      [notebookId, itemType, itemId],
    );
    return rows.length > 0;
  }

  const tables = memory();
  const index = tables.notebookItems.findIndex(
    (item) =>
      item.notebook_id === notebookId &&
      item.item_type === itemType &&
      item.item_id === itemId,
  );
  if (index === -1) return false;
  tables.notebookItems.splice(index, 1);
  return true;
}

/** Notebook id -> item ids, for the Library's "already in" chips. */
export async function membershipIndex(): Promise<Map<string, Set<string>>> {
  const index = new Map<string, Set<string>>();
  let rows: NotebookItemRow[];

  if (dbConfigured()) {
    rows = (
      await query(
        `select notebook_id, item_type, item_id, added_at from notebook_item`,
      )
    ).map(hydrateItem);
  } else {
    rows = memory().notebookItems;
  }

  for (const row of rows) {
    const set = index.get(row.notebook_id) ?? new Set<string>();
    set.add(row.item_id);
    index.set(row.notebook_id, set);
  }
  return index;
}

/** Oldest note in the notebook, used as the generated card screenshot. */
export async function firstNoteId(
  notebookId: string,
): Promise<string | null> {
  const notes = (await listNotebookItems(notebookId))
    .filter((item) => item.item_type === "note")
    .sort((a, b) => Date.parse(a.added_at) - Date.parse(b.added_at));
  return notes[0]?.item_id ?? null;
}

/** Notebooks that can fall back to an ImageResponse of a note. */
export async function notebookIdsWithNotes(): Promise<Set<string>> {
  let rows: NotebookItemRow[];

  if (dbConfigured()) {
    rows = (
      await query(
        `select notebook_id, item_type, item_id, added_at
         from notebook_item where item_type = 'note'`,
      )
    ).map(hydrateItem);
  } else {
    rows = memory().notebookItems.filter((item) => item.item_type === "note");
  }

  return new Set(rows.map((row) => row.notebook_id));
}
