import { dbConfigured, query } from "@/lib/db";
import { activityById, extractById } from "@/lib/seed";
import { getNote } from "./notes";
import { getSource } from "./sources";
import type { NotebookItemType } from "./types";

/**
 * `notebook_item` is polymorphic and carries no foreign key, which is what lets
 * the Library read a whole notebook in one query. The plan's trade is that the
 * API layer enforces the reference instead, so this is that enforcement.
 *
 * Sources go through A's store. Notes, extracts, and activities belong to B, C,
 * and D; until their tables are live, the seed is the source of truth for them.
 */
const TABLES: Record<NotebookItemType, string> = {
  source: "source",
  note: "note",
  extract: "extract",
  activity: "activity",
};

export async function referenceExists(
  itemType: NotebookItemType,
  itemId: string,
): Promise<boolean> {
  if (dbConfigured()) {
    // `itemType` is validated against the enum before it reaches here, so the
    // table name is never attacker-controlled.
    const rows = await query(
      `select 1 from ${TABLES[itemType]} where id = $1 limit 1`,
      [itemId],
    );
    return rows.length > 0;
  }

  switch (itemType) {
    case "source":
      return (await getSource(itemId)) !== null;
    case "note":
      return (await getNote(itemId)) !== null;
    case "extract":
      return extractById(itemId) !== undefined;
    case "activity":
      return activityById(itemId) !== undefined;
  }
}
