import Link from "next/link";
import { Badge, badgeVariants } from "@/components/ui/badge";
import { activities, extracts, notes, sources } from "@/lib/seed";
import { cn } from "@/lib/utils";

const filters = [
  { id: "all", label: "All" },
  { id: "source", label: "Sources" },
  { id: "note", label: "Notes" },
  { id: "extract", label: "Extracts" },
  { id: "activity", label: "Activities" },
] as const;

export default async function LibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const { type } = await searchParams;
  const current = filters.some((f) => f.id === type) ? type : "all";

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Library</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Everything that exists, globally. Workstream A will add multi-select
          and &quot;add to notebook&quot; on top of this list.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {filters.map((filter) => (
          <Link
            key={filter.id}
            href={filter.id === "all" ? "/library" : `/library?type=${filter.id}`}
            className={cn(
              badgeVariants({
                variant: current === filter.id ? "default" : "outline",
              }),
            )}
          >
            {filter.label}
          </Link>
        ))}
      </div>

      {(current === "all" || current === "source") && (
        <section>
          <h2 className="mb-3 font-heading text-lg">Sources</h2>
          <ul className="divide-y rounded-xl border bg-card">
            {sources.map((source) => (
              <li key={source.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <Link href={`/read/${source.id}`} className="font-medium hover:underline">
                    {source.title}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {source.kind} · {source.ingest_method} · {source.word_count}{" "}
                    words
                  </p>
                </div>
                <Badge variant="secondary">{source.ingest_status}</Badge>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(current === "all" || current === "note") && (
        <section>
          <h2 className="mb-3 font-heading text-lg">Notes</h2>
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="rounded-xl border bg-card px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{note.title}</span>
                  <Badge variant="outline">{note.origin}</Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {note.body_md.trim()}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(current === "all" || current === "extract") && (
        <section>
          <h2 className="mb-3 font-heading text-lg">Extracts</h2>
          <ul className="space-y-2">
            {extracts.map((extract) => (
              <li key={extract.id} className="rounded-xl border bg-card px-4 py-3 text-sm">
                <div className="mb-1 flex gap-2 text-xs text-muted-foreground">
                  <span>priority {extract.priority}</span>
                  <span>{extract.anchor_status}</span>
                  <span>{extract.suggested_by}</span>
                </div>
                <p className="font-serif">{extract.body_md}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {(current === "all" || current === "activity") && (
        <section>
          <h2 className="mb-3 font-heading text-lg">Activities</h2>
          <ul className="grid gap-2 sm:grid-cols-2">
            {activities.map((activity) => (
              <li key={activity.id} className="rounded-xl border bg-card px-4 py-3 text-sm">
                <Badge variant="secondary">{activity.type}</Badge>
                <p className="mt-2">
                  {"stem" in activity.payload
                    ? activity.payload.stem
                    : activity.payload.template}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
