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
  activitiesInNotebook,
  diagnosticsForNotebook,
  extractById,
  itemsInNotebook,
  notebookById,
  noteById,
  sourceById,
} from "@/lib/seed";

export default async function NotebookDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const notebook = notebookById(id);
  if (!notebook) notFound();

  const items = itemsInNotebook(id);
  const sources = items
    .filter((i) => i.item_type === "source")
    .map((i) => sourceById(i.item_id))
    .filter((s) => s != null);
  const notes = items
    .filter((i) => i.item_type === "note")
    .map((i) => noteById(i.item_id))
    .filter((n) => n != null);
  const extracts = items
    .filter((i) => i.item_type === "extract")
    .map((i) => extractById(i.item_id))
    .filter((e) => e != null);
  const activities = activitiesInNotebook(id);
  const diag = diagnosticsForNotebook(id);

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
            style={{ background: notebook.color }}
          />
          <h1 className="font-heading text-3xl tracking-tight">{notebook.name}</h1>
        </div>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          {notebook.description}
        </p>
      </header>

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

      <p className="text-sm text-muted-foreground">{diag.next_action}</p>

      <section>
        <h2 className="mb-3 font-heading text-lg">Sources</h2>
        <ul className="space-y-2">
          {sources.map((source) => (
            <li key={source.id}>
              <Link href={`/read/${source.id}`} className="hover:underline">
                {source.title}
              </Link>
              <span className="ml-2 text-xs text-muted-foreground">
                {source.kind} · {source.word_count} words · {source.ingest_status}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Notes</h2>
        <ul className="space-y-3">
          {notes.map((note) => (
            <li key={note.id}>
              <div className="flex items-center gap-2">
                <span className="font-medium">{note.title}</span>
                <Badge variant="outline">{note.origin}</Badge>
              </div>
              <p className="text-muted-foreground">{note.body_md.trim()}</p>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Extracts</h2>
        <ul className="space-y-2">
          {extracts.map((extract) => (
            <li key={extract.id} className="text-sm">
              <span className="text-muted-foreground">p{extract.priority}</span>{" "}
              <span className="font-serif">{extract.body_md}</span>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 font-heading text-lg">Activities</h2>
        <p className="mb-2 text-sm text-muted-foreground">
          {activities.length} questions in this notebook, all four types.
        </p>
        <div className="flex flex-wrap gap-1.5">
          {activities.map((activity) => (
            <Badge key={activity.id} variant="secondary">
              {activity.type}
            </Badge>
          ))}
        </div>
      </section>
    </div>
  );
}
