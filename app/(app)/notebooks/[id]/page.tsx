import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkline } from "@/components/sparkline";
import { diagnosticsForNotebook } from "@/lib/diagnostics/notebook";
import { hashBody } from "@/lib/hash";
import { getExtract } from "@/lib/store/extracts";
import { getNotebook, listNotebookItems } from "@/lib/store/notebooks";
import { getNote } from "@/lib/store/notes";
import { itemPreviewSrc } from "@/lib/store/previews";
import { getActivity } from "@/lib/store/review";
import { getSource } from "@/lib/store/sources";
import { resolveNotebookColor } from "@/lib/themes";
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

  const diag = await diagnosticsForNotebook(id);
  const hasDiagnostics =
    diag.struggling.length + diag.known.length + diag.untouched.length > 0;
  const color = resolveNotebookColor(notebook.color);

  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm text-muted-foreground">
          <Link href="/notebooks" className="hover:underline">
            Notebooks
          </Link>
        </p>
        <div className="mt-2 flex items-center gap-3">
          <span
            className="size-3 rounded-full"
            style={{ background: color }}
          />
          <h1 className="font-heading text-3xl tracking-tight">
            {notebook.name}
          </h1>
        </div>
        {notebook.description ? (
          <p className="mt-2 max-w-2xl text-muted-foreground">
            {notebook.description}
          </p>
        ) : null}
      </header>

      {!hasDiagnostics ? (
        <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
          Nothing to diagnose yet. Add notes or extracts from the Library and
          the concept breakdown appears here.
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
          activity.source_body_hash,
        ),
      };
    }
    default:
      return null;
  }
}
