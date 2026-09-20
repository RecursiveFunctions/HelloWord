import { dbConfigured, query } from "@/lib/db";
import { memory } from "./memory";
import type { ConceptExtractRow, ConceptNoteRow, ConceptRow } from "./types";

function hydrateConcept(row: Record<string, unknown>): ConceptRow {
  return { id: String(row.id), label: String(row.label) };
}

export async function listConcepts(): Promise<ConceptRow[]> {
  if (dbConfigured()) {
    const rows = await query(`select id, label from concept order by label`);
    return rows.map(hydrateConcept);
  }
  return memory().concepts;
}

export async function listConceptNotes(): Promise<ConceptNoteRow[]> {
  if (dbConfigured()) {
    const rows = await query(`select concept_id, note_id from concept_note`);
    return rows.map((row) => ({
      concept_id: String(row.concept_id),
      note_id: String(row.note_id),
    }));
  }
  return memory().conceptNotes;
}

export async function listConceptExtracts(): Promise<ConceptExtractRow[]> {
  if (dbConfigured()) {
    const rows = await query(`select concept_id, extract_id from concept_extract`);
    return rows.map((row) => ({
      concept_id: String(row.concept_id),
      extract_id: String(row.extract_id),
    }));
  }
  return memory().conceptExtracts;
}

export async function firstConceptForNote(
  noteId: string,
): Promise<ConceptRow | null> {
  if (dbConfigured()) {
    const rows = await query(
      `select c.id, c.label
       from concept c
       join concept_note cn on cn.concept_id = c.id
       where cn.note_id = $1
       order by c.label
       limit 1`,
      [noteId],
    );
    return rows[0] ? hydrateConcept(rows[0]) : null;
  }
  const relation = memory().conceptNotes.find((row) => row.note_id === noteId);
  if (!relation) return null;
  return memory().concepts.find((concept) => concept.id === relation.concept_id) ?? null;
}