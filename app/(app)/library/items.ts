import type {
  ActivityRow,
  ExtractRow,
  IngestStatus,
  NoteRow,
  SourceRow,
} from "@/lib/store/types";

/**
 * One flat row shape for the four things the Library lists, so the client
 * component can filter, select, and add to a notebook without knowing which
 * table an item came from.
 */
export type LibraryItemType = "source" | "note" | "extract" | "activity";

export type LibraryItem = {
  type: LibraryItemType;
  id: string;
  title: string;
  subtitle: string;
  meta: string[];
  href?: string;
  status?: IngestStatus;
  error?: string | null;
};

export function sourceItem(source: SourceRow): LibraryItem {
  return {
    type: "source",
    id: source.id,
    title: source.title,
    subtitle: source.markdown?.slice(0, 220).replace(/^#+\s*/gm, "") ?? "",
    meta: [
      source.kind,
      source.ingest_method ?? "not yet extracted",
      source.word_count ? `${source.word_count.toLocaleString()} words` : "",
    ].filter(Boolean),
    // Only a ready source has markdown, and the reader renders markdown.
    href: source.ingest_status === "ready" ? `/read/${source.id}` : undefined,
    status: source.ingest_status,
    error: source.ingest_error,
  };
}

export function noteItem(note: NoteRow): LibraryItem {
  return {
    type: "note",
    id: note.id,
    title: note.title,
    subtitle: note.body_md.trim(),
    meta: [note.origin, `updated ${new Date(note.updated_at).toLocaleDateString()}`],
  };
}

export function extractItem(extract: ExtractRow): LibraryItem {
  return {
    type: "extract",
    id: extract.id,
    title: extract.body_md.slice(0, 80),
    subtitle: extract.body_md,
    meta: [
      `priority ${extract.priority}`,
      extract.anchor_status,
      extract.suggested_by,
    ],
  };
}

export function activityItem(activity: ActivityRow): LibraryItem {
  const payload = activity.payload;
  const stem = "stem" in payload ? payload.stem : payload.template;
  return {
    type: "activity",
    id: activity.id,
    title: stem,
    subtitle: "",
    meta: [activity.type],
  };
}
