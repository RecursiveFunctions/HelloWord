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
import { notebookSparkline } from "@/lib/seed";
import { dueCounts } from "@/lib/fsrs/queue";
import { listNotebooks } from "@/lib/store/notebooks";
import { resolveNotebookColor } from "@/lib/themes";
import { NewNotebook } from "./new-notebook";

export const dynamic = "force-dynamic";

export default async function NotebooksPage() {
  // The same rollup the Review screen serves, so a notebook's badge and its
  // queue never disagree.
  const [notebooks, { byNotebook }] = await Promise.all([
    listNotebooks(),
    dueCounts(),
  ]);

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-heading text-3xl tracking-tight">Notebooks</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            What's on your mind?
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
            const due = byNotebook[notebook.id] ?? 0;
            const color = resolveNotebookColor(notebook.color);
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
