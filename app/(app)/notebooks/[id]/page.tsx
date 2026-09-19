import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  activityById,
  conceptExtracts,
  conceptNotes,
  concepts,
  diagnosticsForNotebook,
  extractById,
  noteById,
} from "@/lib/seed";
import { getNotebook, listNotebookItems } from "@/lib/store/notebooks";
import { getSource } from "@/lib/store/sources";
import {
  activityItem,
  extractItem,
  noteItem,
  sourceItem,
  type LibraryItem,
} from "../../library/items";
import { NotebookContents } from "./notebook-contents";

export const dynamic = "force-dynamic";

export default async function NotebookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notebook = await getNotebook(id);
  if (!notebook) notFound();

  const membership = await listNotebookItems(id);
  const items = (
    await Promise.all(membership.map((item) => resolve(item.item_type, item.item_id)))
  ).filter((item) => item !== null);

  const diag = scopeToNotebook(diagnosticsForNotebook(id), membership);
  const hasDiagnostics =
    diag.struggling.length + diag.known.length + diag.untouched.length > 0;
  const color = notebook.color ?? "var(--color-primary)";

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
      <section className="grid gap-3 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Struggling</CardTitle>
            <CardDescription>Hard or worse, or still unstable.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {diag.struggling.length === 0 ? (
              <p className="text-muted-foreground">None right now.</p>
            ) : (
              diag.struggling.map((row) => (
                <div key={row.concept}>
                  <div className="font-medium">{row.concept}</div>
                  <p className="text-muted-foreground">{row.why}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Known</CardTitle>
            <CardDescription>Recall holding across 90 days.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {diag.known.map((label) => (
              <Badge key={label} variant="secondary">
                {label}
              </Badge>
            ))}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>Untouched</CardTitle>
            <CardDescription>Tagged, never reviewed.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-1.5">
            {diag.untouched.length === 0 ? (
              <p className="text-muted-foreground">Every concept has reviews.</p>
            ) : (
              diag.untouched.map((label) => (
                <Badge key={label} variant="outline">
                  {label}
                </Badge>
              ))
            )}
          </CardContent>
        </Card>
      </section>
      )}

      {hasDiagnostics ? (
        <p className="text-sm text-muted-foreground">{diag.next_action}</p>
      ) : null}

      <NotebookContents notebookId={id} items={items} />
    </div>
  );
}

/**
 * Diagnostics are a pure aggregate over a notebook's own contents, so an empty
 * notebook must report nothing. `diagnosticsForNotebook` currently rolls up
 * every concept globally, which would otherwise show a notebook created a
 * minute ago as already knowing eight of them. Narrow the three buckets to the
 * concepts actually reachable from this notebook's notes and extracts.
 *
 * Workstream D owns the real per-notebook rollup against `review_daily`; this
 * is the screen refusing to overstate what it knows until that lands.
 */
function scopeToNotebook(
  diagnostics: ReturnType<typeof diagnosticsForNotebook>,
  membership: { item_type: string; item_id: string }[],
) {
  const noteIds = new Set(
    membership.filter((i) => i.item_type === "note").map((i) => i.item_id),
  );
  const extractIds = new Set(
    membership.filter((i) => i.item_type === "extract").map((i) => i.item_id),
  );

  const conceptIds = new Set([
    ...conceptNotes
      .filter((link) => noteIds.has(link.note_id))
      .map((link) => link.concept_id),
    ...conceptExtracts
      .filter((link) => extractIds.has(link.extract_id))
      .map((link) => link.concept_id),
  ]);

  const labels = new Set(
    concepts.filter((c) => conceptIds.has(c.id)).map((c) => c.label),
  );

  const struggling = diagnostics.struggling.filter((row) =>
    labels.has(row.concept),
  );

  return {
    struggling,
    known: diagnostics.known.filter((label) => labels.has(label)),
    untouched: diagnostics.untouched.filter((label) => labels.has(label)),
    next_action: struggling[0]
      ? `Review ${struggling[0].concept} next — ${struggling[0].why}`
      : diagnostics.next_action,
  };
}

/**
 * `notebook_item` is polymorphic, so membership rows resolve against four
 * different tables. Sources are A's and live in the store; the rest still come
 * from the seed until B, C, and D land theirs.
 */
async function resolve(
  type: string,
  itemId: string,
): Promise<LibraryItem | null> {
  switch (type) {
    case "source": {
      const source = await getSource(itemId);
      return source ? sourceItem(source) : null;
    }
    case "note": {
      const note = noteById(itemId);
      return note ? noteItem(note) : null;
    }
    case "extract": {
      const extract = extractById(itemId);
      return extract ? extractItem(extract) : null;
    }
    case "activity": {
      const activity = activityById(itemId);
      return activity ? activityItem(activity) : null;
    }
    default:
      return null;
  }
}
