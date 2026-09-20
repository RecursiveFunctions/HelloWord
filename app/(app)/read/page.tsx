import { PageHeader } from "@/components/page-header";
import { readingSnapshot } from "@/lib/reading/queue";
import { listDrafts } from "@/lib/store/distill";
import { getSource } from "@/lib/store/sources";
import { Triage } from "./triage";

export const dynamic = "force-dynamic";

/** Enough for a sitting. The rest is still there on the next load. */
const SESSION_LIMIT = 30;

/**
 * The incremental reading queue: passages that are due, most important first,
 * each with the note and cards the model drafted for it. Whole sources are
 * rarely read end to end; this is where reading happens.
 */
export default async function ReadQueuePage() {
  const snapshot = await readingSnapshot({ includePending: true, limit: SESSION_LIMIT });
  const sourceIds = [...new Set(snapshot.items.map((item) => item.source_id!))];
  const [drafts, sources] = await Promise.all([
    listDrafts(snapshot.items.map((item) => item.id)),
    Promise.all(sourceIds.map((id) => getSource(id))),
  ]);

  // One copy of each source's markdown, however many of its passages are due.
  const markdown: Record<string, string> = {};
  for (const source of sources) {
    if (source?.markdown) markdown[source.id] = source.markdown;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        className="mb-0"
        title="Read"
        description="Passages worth your time, most important first."
        meta={`${snapshot.counts.due} due · ${snapshot.counts.queued} in the queue`}
      />
      <Triage initialItems={snapshot.items} initialDrafts={drafts} markdown={markdown} />
    </div>
  );
}
