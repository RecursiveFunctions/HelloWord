import { hashBody } from "@/lib/hash";
import { activityById, extractById, noteById } from "@/lib/seed";
import { activityPreview, paperPreview } from "./note-cover";
import { firstNoteId, listNotebookItems } from "./notebooks";
import { getSource } from "./sources";
import type { SourceRow } from "./types";

export const PREVIEW_TYPES = ["source", "note", "extract", "activity"] as const;
export type PreviewType = (typeof PREVIEW_TYPES)[number];

export function isPreviewType(value: string): value is PreviewType {
  return (PREVIEW_TYPES as readonly string[]).includes(value);
}

export function itemPreviewSrc(
  type: PreviewType,
  id: string,
  token: string | null,
): string | null {
  if (!token) return null;
  return `/api/previews/${type}/${id}?v=${encodeURIComponent(token)}`;
}

export async function notebookPreviewSrc(
  notebookId: string,
): Promise<string | null> {
  const token = await notebookCoverToken(notebookId);
  if (!token) return null;
  return `/api/notebooks/${notebookId}/cover?v=${encodeURIComponent(token)}`;
}

export async function notebookCoverToken(
  notebookId: string,
): Promise<string | null> {
  const noteId = await firstNoteId(notebookId);
  const note = noteId ? noteById(noteId) : undefined;
  if (note) return note.body_hash;

  const source = await firstReadySource(notebookId);
  if (!source?.markdown) return null;
  return `${source.ingest_status}-${hashBody(source.markdown)}`;
}

export async function firstReadySource(
  notebookId: string,
): Promise<SourceRow | null> {
  const rows = (await listNotebookItems(notebookId))
    .filter((item) => item.item_type === "source")
    .sort((a, b) => Date.parse(a.added_at) - Date.parse(b.added_at));

  for (const row of rows) {
    const source = await getSource(row.item_id);
    if (source?.markdown) return source;
  }
  return null;
}

export async function liveNotebookCover(input: {
  notebookId: string;
  color: string;
}) {
  const noteId = await firstNoteId(input.notebookId);
  const note = noteId ? noteById(noteId) : undefined;
  if (note) {
    return paperPreview({
      title: note.title,
      body: note.body_md,
      color: input.color,
    });
  }

  const source = await firstReadySource(input.notebookId);
  if (source?.markdown) {
    return paperPreview({
      kicker: source.kind,
      title: source.title,
      body: source.markdown,
      color: input.color,
    });
  }

  return null;
}

export async function liveItemPreview(type: PreviewType, id: string) {
  switch (type) {
    case "source": {
      const source = await getSource(id);
      if (!source?.markdown) return null;
      return paperPreview({
        kicker: source.kind,
        title: source.title,
        body: source.markdown,
        color: "#1d4ed8",
      });
    }
    case "note": {
      const note = noteById(id);
      if (!note) return null;
      return paperPreview({
        title: note.title,
        body: note.body_md,
        color: "#c2410c",
      });
    }
    case "extract": {
      const extract = extractById(id);
      if (!extract) return null;
      return paperPreview({
        kicker: "Extract",
        title: "Highlighted passage",
        body: extract.body_md,
        color: "#d97706",
        quote: true,
      });
    }
    case "activity": {
      const activity = activityById(id);
      if (!activity) return null;
      return activityPreview({ payload: activity.payload });
    }
  }
}
