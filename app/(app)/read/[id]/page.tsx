import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { extracts, notes, sourceById } from "@/lib/seed";
import extractProposals from "@/lib/ai/__fixtures__/extract-proposals.json";
import { parseBlocks } from "@/lib/editor/blocks";
import { SourcePane } from "./source-pane";

/** Most ingested sources open with their own H1, so avoid printing it twice. */
function documentLeadsWithTitle(markdown: string, title: string): boolean {
  const [first] = parseBlocks(markdown);
  return (
    first?.kind === "heading" &&
    first.level === 1 &&
    first.span.text.trim().toLowerCase() === title.trim().toLowerCase()
  );
}

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const source = sourceById(id);
  if (!source) notFound();

  const sourceExtracts = extracts
    .filter((e) => e.source_id === id && e.anchor_status !== "detached")
    .map((e) => ({
      id: e.id,
      start: e.selector.start,
      end: e.selector.end,
      orphaned: e.anchor_status === "orphaned",
    }));

  return (
    <div
      data-full-bleed
      className="flex min-h-[calc(100svh-var(--topbar-h))]"
    >
      <div className="min-w-0 flex-1 overflow-auto px-10 py-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/notebooks" className="hover:underline">
            HelloWord
          </Link>
          <span className="mx-2">/</span>
          <Link href="/library" className="hover:underline">
            Library
          </Link>
          <span className="mx-2">/</span>
          {source.kind} · {source.ingest_method}
        </p>
        {!documentLeadsWithTitle(source.markdown, source.title) && (
          <h1 className="mt-2 font-heading text-3xl tracking-tight">
            {source.title}
          </h1>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {source.word_count} words · {sourceExtracts.length} extracts anchored
        </p>
        <div className="mt-6 max-w-2xl">
          <SourcePane markdown={source.markdown} extracts={sourceExtracts} />
        </div>
      </div>

      <aside className="w-[28rem] shrink-0 overflow-auto border-l bg-sidebar px-5 py-8">
        <h2 className="font-heading text-lg">Note editor</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Tiptap lands here next. Seeded notes and C&apos;s fixture proposals
          sit below so the rail is not empty.
        </p>
        <div className="mt-6 space-y-3">
          {notes.slice(0, 3).map((note) => (
            <div key={note.id} className="rounded-lg border bg-card p-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{note.title}</span>
                <Badge variant="outline">{note.origin}</Badge>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                {note.body_md.trim()}
              </p>
            </div>
          ))}
        </div>
        <h3 className="mt-8 mb-2 text-sm font-medium">
          Margin proposals (fixture)
        </h3>
        <ul className="space-y-2">
          {extractProposals.map((proposal) => (
            <li
              key={proposal.exact}
              className="rounded-lg border bg-card p-3 text-sm"
            >
              <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                <span>priority {proposal.priority}</span>
                <span>{proposal.concepts.join(", ")}</span>
              </div>
              <p className="font-serif">{proposal.exact}</p>
              <p className="mt-1 text-muted-foreground">{proposal.reason}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 text-xs text-muted-foreground">
          Swap this JSON for{" "}
          <code className="font-mono">POST /api/ai/extracts</code> in wave 2.
        </p>
      </aside>
    </div>
  );
}
