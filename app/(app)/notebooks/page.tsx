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
import { dueCount, notebookSparkline, notebooks } from "@/lib/seed";

export default function NotebooksPage() {
  return (
    <div>
      <header className="mb-8">
        <h1 className="font-heading text-3xl tracking-tight">Notebooks</h1>
        <p className="mt-2 max-w-2xl text-muted-foreground">
          Saved collections of sources, notes, extracts, and activities. Nothing
          is owned by a notebook — membership is a join table, so one source can
          live in many places.
        </p>
      </header>
      <div className="grid gap-4 sm:grid-cols-2">
        {notebooks.map((notebook) => {
          const due = dueCount(notebook.id);
          const spark = notebookSparkline(notebook);
          return (
            <Link key={notebook.id} href={`/notebooks/${notebook.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="mb-2 h-1.5 w-10 rounded-full" style={{ background: notebook.color }} />
                  <CardTitle>{notebook.name}</CardTitle>
                  <CardDescription>{notebook.description}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-end justify-between gap-4">
                  <div>
                    {due > 0 ? (
                      <Badge>{due} due</Badge>
                    ) : (
                      <Badge variant="secondary">Caught up</Badge>
                    )}
                  </div>
                  <Sparkline
                    values={spark}
                    color={notebook.color}
                    className="h-8 w-28 text-primary"
                  />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
