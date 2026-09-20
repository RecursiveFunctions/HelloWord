import { PageHeader } from "@/components/page-header";
import { notFound } from "next/navigation";
import { Sparkline } from "@/components/sparkline";
import { diagnosticsForNotebook } from "@/lib/diagnostics/notebook";
import { hashBody } from "@/lib/hash";
import { itemPreviewSrc } from "@/lib/store/previews";
import { getExtract, listExtracts } from "@/lib/store/extracts";
import { getNotebook, listNotebookItems } from "@/lib/store/notebooks";
import { getNote, listNotes } from "@/lib/store/notes";
import { getActivity, listActivities } from "@/lib/store/review";
import { resolveNotebookColor } from "@/lib/themes";
import { getSource, listSources } from "@/lib/store/sources";
import {
  activityItem,
  extractItem,
  noteItem,
  sourceItem,
  type LibraryItem,
} from "../../library/items";
import { NotebookContents } from "./notebook-contents";
import { NotebookDiagnostics } from "./notebook-diagnostics";

export const dynamic = "force-dynamic";

export default async function NotebookDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ id }, { view: viewParam }] = await Promise.all([params, searchParams]);
  const notebook = await getNotebook(id);
  if (!notebook) notFound();
  const fromQuery = viewParam === "list" || viewParam === "cards";

  const membership = await listNotebookItems(id);
  const items = (
    await Promise.all(
      membership.map((item) => resolve(item.item_type, item.item_id)),
    )
  ).filter((item) => item !== null);

  const [sources, notes, extracts, activities] = await Promise.all([
    listSources(),
    listNotes(),
    listExtracts(),
    listActivities(),
  ]);
  const member = new Set(membership.map((m) => `${m.item_type}:${m.item_id}`));
  const libraryItems = [
    ...sources.map(sourceItem),
    ...notes.map(noteItem),
    ...extracts.map(extractItem),
    ...activities.map(activityItem),
  ].filter((item) => !member.has(`${item.type}:${item.id}`));

  const diag = await diagnosticsForNotebook(id);
  const hasDiagnostics =
    diag.struggling.length + diag.known.length + diag.untouched.length > 0;
  const color = resolveNotebookColor(notebook.color);

  return (
    <div className="space-y-8">
      <PageHeader
        className="mb-0"
        breadcrumb={[
          { label: "Notebooks", href: "/notebooks" },
          {
            label: notebook.name,
            icon: (
              <span
                className="size-3 shrink-0 rounded-full"
                style={{ background: color }}
              />
            ),
          },
        ]}
        description={notebook.description || undefined}
      />

      {!hasDiagnostics ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing to diagnose yet. Add notes or extracts to this notebook and the
          concept breakdown appears here.
        </p>
      ) : (
        <NotebookDiagnostics
          struggling={diag.struggling.map((row) => ({
            concept: row.concept,
            why: row.why ?? "Needs more review history.",
          }))}
          known={diag.known.map((row) => row.concept)}
          untouched={diag.untouched.map((row) => row.concept)}
        />
      )}

      {hasDiagnostics ? (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border bg-card px-4 py-3">
          <div>
            <p className="text-sm">{diag.nextAction}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              90-day trend from{" "}
              {diag.source === "review_daily"
                ? "Tiger review_daily"
                : "fixture rollup"}
            </p>
          </div>
          {diag.trend.some((value) => value > 0) ? (
            <Sparkline values={diag.trend} color={color} className="h-8 w-32" />
          ) : null}
        </div>
      ) : null}

      <NotebookContents
        notebookId={id}
        items={items}
        libraryItems={libraryItems}
        initialView={fromQuery ? viewParam : "cards"}
        fromQuery={fromQuery}
      />
    </div>
  );
}

/**
 * `notebook_item` is polymorphic, so membership rows resolve against four
 * different store modules.
 */
async function resolve(
  type: string,
  itemId: string,
): Promise<LibraryItem | null> {
  switch (type) {
    case "source": {
      const source = await getSource(itemId);
      if (!source) return null;
      return {
        ...sourceItem(source),
        previewSrc: itemPreviewSrc(
          "source",
          source.id,
          source.markdown
            ? `${source.ingest_status}-${hashBody(source.markdown)}`
            : null,
        ),
      };
    }
    case "note": {
      const note = await getNote(itemId);
      if (!note) return null;
      return {
        ...noteItem(note),
        previewSrc: itemPreviewSrc("note", note.id, note.body_hash),
      };
    }
    case "extract": {
      const extract = await getExtract(itemId);
      if (!extract) return null;
      return {
        ...extractItem(extract),
        previewSrc: itemPreviewSrc(
          "extract",
          extract.id,
          hashBody(extract.body_md),
        ),
      };
    }
    case "activity": {
      const activity = await getActivity(itemId);
      if (!activity) return null;
      return {
        ...activityItem(activity),
        previewSrc: itemPreviewSrc(
          "activity",
          activity.id,
          activity.source_body_hash ?? JSON.stringify(activity.payload),
        ),
      };
    }
    default:
      return null;
  }
}
