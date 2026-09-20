import Link from "next/link";
import { notFound } from "next/navigation";
import { parseBlocks } from "@/lib/editor/blocks";
import { listSourceExtracts } from "@/lib/store/extracts";
import { getSource } from "@/lib/store/sources";
import { ReaderShell } from "./reader-shell";

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
  const [source, sourceExtracts] = await Promise.all([
    getSource(id),
    listSourceExtracts(id),
  ]);
  if (
    !source ||
    source.ingest_status !== "ready" ||
    source.markdown === null
  ) {
    notFound();
  }

  return (
    <div data-full-bleed className="flex min-h-svh flex-col">
      <div className="px-10 pt-8">
        <p className="text-sm text-muted-foreground">
          <Link href="/notebooks" className="hover:underline">
            HelloWord
          </Link>
          <span className="mx-2">/</span>
          <Link href="/library" className="hover:underline">
            Library
          </Link>
          <span className="mx-2">/</span>
          {source.kind} · {source.ingest_method ?? "ingested"}
        </p>
        {!documentLeadsWithTitle(source.markdown, source.title) && (
          <h1 className="mt-2 font-heading text-3xl tracking-tight">
            {source.title}
          </h1>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          {source.word_count ?? 0} words · {sourceExtracts.length} extracts
          anchored
        </p>
      </div>
      <ReaderShell
        source={{
          id: source.id,
          title: source.title,
          markdown: source.markdown,
        }}
        initialExtracts={sourceExtracts}
      />
    </div>
  );
}
