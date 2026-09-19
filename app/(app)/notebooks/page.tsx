import Link from "next/link";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import { notebookSparkline, schedules, SEED_NOW } from "@/lib/seed";
import { listNotebooks, membershipIndex } from "@/lib/store/notebooks";
import { NewNotebook } from "./new-notebook";

export const dynamic = "force-dynamic";

export default async function NotebooksPage() {
  const [notebooks, membership] = await Promise.all([
    listNotebooks(),
    membershipIndex(),
  ]);

  // Due counts come from the notebook's own membership rows rather than the
  // seed's, so a notebook created a minute ago counts correctly.
  const dueByNotebook = new Map(
    notebooks.map((notebook) => {
      const members = membership.get(notebook.id) ?? new Set<string>();
      const due = schedules.filter(
        (schedule) =>
          members.has(schedule.activity_id) &&
          new Date(schedule.due) <= SEED_NOW,
      ).length;
      return [notebook.id, due];
    }),
  );

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">Notebooks</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Saved collections of sources, notes, extracts, and activities.
            Nothing is owned by a notebook — membership is a join table, so one
            source can live in many places.
          </p>
        </div>
        <NewNotebook />
      </header>

      {notebooks.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No notebooks yet</EmptyTitle>
            <EmptyDescription>
              Create one, then add sources to it from the Library.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {notebooks.map((notebook) => {
            const due = dueByNotebook.get(notebook.id) ?? 0;
            const color = notebook.color ?? "var(--color-primary)";
            const spark = notebookSparkline({
              ...notebook,
              description: notebook.description ?? "",
              color,
            });
            return (
              <Link key={notebook.id} href={`/notebooks/${notebook.id}`}>
                <Card className="h-full transition-shadow hover:shadow-md">
                  <CardHeader>
                    <div
                      className="mb-2 h-1.5 w-10 rounded-full"
                      style={{ background: color }}
                    />
                    <CardTitle>{notebook.name}</CardTitle>
                    <CardDescription>
                      {notebook.description ?? "No description yet."}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex items-end justify-between gap-4">
                    <div>
                      {due > 0 ? (
                        <Badge>{due} due</Badge>
                      ) : (
                        <Badge variant="secondary">Caught up</Badge>
                      )}
                    </div>
                    {/* A notebook with no review history draws a flat line
                        that reads as a stray divider, so draw nothing. */}
                    {spark.some((value) => value > 0) ? (
                      <Sparkline
                        values={spark}
                        color={color}
                        className="h-8 w-28 text-primary"
                      />
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        No reviews yet
                      </span>
                    )}
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
