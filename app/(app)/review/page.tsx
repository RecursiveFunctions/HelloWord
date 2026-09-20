import { dueCounts, queueSnapshot, toClientCard } from "@/lib/fsrs/queue";
import { listNotebooks } from "@/lib/store/notebooks";
import { getProfile } from "@/lib/store/review";
import { Reviewer } from "./reviewer";

export const dynamic = "force-dynamic";

/**
 * The first card is server-rendered so the session starts on the answer rather
 * than on a spinner. Everything after it is fetched client-side, because a
 * grade has to advance the queue without a round trip through the router.
 */
export default async function ReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ notebook?: string | string[] }>;
}) {
  const { notebook } = await searchParams;
  // `?notebook=a&notebook=b` preselects a subset; absent means everything.
  const selected =
    notebook === undefined
      ? undefined
      : Array.isArray(notebook)
        ? notebook
        : [notebook];

  const [notebooks, profile, snapshot, counts] = await Promise.all([
    listNotebooks(),
    getProfile(),
    queueSnapshot({ notebookIds: selected }),
    dueCounts(),
  ]);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-heading text-3xl tracking-tight">Review</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Practice makes perfect.
        </p>
      </header>

      <Reviewer
        notebooks={notebooks.map((row) => ({
          id: row.id,
          name: row.name,
          color: row.color,
        }))}
        initialSnapshot={{
          cards: snapshot.cards.map(toClientCard),
          counts,
          clockOffsetMs: profile.clock_offset_ms,
          now: snapshot.now,
          nextDue: snapshot.nextDue,
        }}
        initialSelection={selected ?? null}
        initialDayMs={profile.day_ms}
      />
    </div>
  );
}
