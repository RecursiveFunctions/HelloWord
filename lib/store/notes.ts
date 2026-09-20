import { dbConfigured, query } from "@/lib/db";
import { normalizeMarkdown } from "@/lib/contracts/markdown";
import { hashBody } from "@/lib/hash";
import { memory } from "./memory";
import { isoString, type ExtractNoteRow, type NoteRow } from "./types";

const COLUMNS = `id, title, body_md, body_hash, origin, created_at, updated_at`;

function hydrate(row: Record<string, unknown>): NoteRow {
  return {
    id: String(row.id),
    title: String(row.title),
    body_md: String(row.body_md),
    body_hash: String(row.body_hash),
    origin: row.origin as NoteRow["origin"],
    created_at: isoString(row.created_at),
    updated_at: isoString(row.updated_at),
  };
}

export async function listNotes(): Promise<NoteRow[]> {
  if (dbConfigured()) {
    return (await query(`select ${COLUMNS} from note order by updated_at desc`)).map(hydrate);
  }
  return memory().notes;
}

export async function getNote(id: string): Promise<NoteRow | null> {
  if (dbConfigured()) {
    const rows = await query(`select ${COLUMNS} from note where id = $1`, [id]);
    return rows[0] ? hydrate(rows[0]) : null;
  }
  return memory().notes.find((note) => note.id === id) ?? null;
}

export async function updateNote(
  id: string,
  patch: { title?: string; body_md?: string },
): Promise<NoteRow | null> {
  const current = await getNote(id);
  if (!current) return null;
  const title = patch.title?.trim() ?? current.title;
  const body = patch.body_md === undefined
    ? current.body_md
    : normalizeMarkdown(patch.body_md);
  const bodyHash = hashBody(body);
  const origin = current.origin === "human" ? "human" : "ai_edited";

  if (dbConfigured()) {
    const rows = await query(
      `update note
          set title = $2, body_md = $3, body_hash = $4, origin = $5, updated_at = now()
        where id = $1
        returning ${COLUMNS}`,
      [id, title, body, bodyHash, origin],
    );
    return rows[0] ? hydrate(rows[0]) : null;
  }

  const row = memory().notes.find((note) => note.id === id);
  if (!row) return null;
  Object.assign(row, {
    title,
    body_md: body,
    body_hash: bodyHash,
    origin,
    updated_at: new Date().toISOString(),
  });
  return row;
}

export async function createNote(input: {
  title: string;
  body_md?: string;
  /** Defaults to `human`. An approved AI draft says what it is. */
  origin?: NoteRow["origin"];
}): Promise<NoteRow> {
  const origin = input.origin ?? "human";
  const title = input.title.trim() || "Untitled note";
  const body = normalizeMarkdown(input.body_md ?? "");
  const bodyHash = hashBody(body);

  if (dbConfigured()) {
    const rows = await query(
      `insert into note (title, body_md, body_hash, origin)
       values ($1, $2, $3, $4)
       returning ${COLUMNS}`,
      [title, body, bodyHash, origin],
    );
    return hydrate(rows[0]);
  }

  const now = new Date().toISOString();
  const row: NoteRow = {
    id: crypto.randomUUID(),
    title,
    body_md: body,
    body_hash: bodyHash,
    origin,
    created_at: now,
    updated_at: now,
  };
  memory().notes.unshift(row);
  return row;
}

export async function listNotesByIds(ids: string[]): Promise<NoteRow[]> {
  if (ids.length === 0) return [];
  if (dbConfigured()) {
    const rows = await query(
      `select ${COLUMNS} from note where id = any($1::uuid[]) order by updated_at desc`,
      [ids],
    );
    return rows.map(hydrate);
  }
  const wanted = new Set(ids);
  return memory().notes.filter((note) => wanted.has(note.id));
}

/** Record that an extract was distilled into a note. Idempotent. */
export async function linkExtractNote(extractId: string, noteId: string): Promise<void> {
  if (dbConfigured()) {
    await query(
      `insert into extract_note (extract_id, note_id) values ($1, $2)
       on conflict do nothing`,
      [extractId, noteId],
    );
    return;
  }
  const relations = memory().extractNotes;
  if (!relations.some((r) => r.extract_id === extractId && r.note_id === noteId)) {
    relations.push({ extract_id: extractId, note_id: noteId });
  }
}

export async function listExtractNotes(extractIds: string[]): Promise<ExtractNoteRow[]> {
  if (extractIds.length === 0) return [];
  if (dbConfigured()) {
    const rows = await query(
      `select extract_id, note_id from extract_note where extract_id = any($1::uuid[])`,
      [extractIds],
    );
    return rows.map((row) => ({
      extract_id: String(row.extract_id),
      note_id: String(row.note_id),
    }));
  }
  const wanted = new Set(extractIds);
  return memory().extractNotes.filter((relation) => wanted.has(relation.extract_id));
}
