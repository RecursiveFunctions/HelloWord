"use client";

import { NotebookHistory } from "@/components/history-menu";
import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Info, Trash2, UploadCloud } from "lucide-react";
import { Sparkline } from "@/components/sparkline";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trashWithUndo } from "@/lib/client/trash";
import { cn } from "@/lib/utils";
import { NewNotebook } from "./new-notebook";
import { useFileDrop, useNotebookUpload } from "./use-notebook-upload";
import {
  useWorkspaceView,
  WorkspaceViewToggle,
  type WorkspaceView,
} from "./workspace-view";

export type NotebookCardModel = {
  id: string;
  name: string;
  description: string | null;
  color: string;
  due: number;
  spark: number[];
  coverSrc: string | null;
};

export function NotebookBrowser({
  items,
  initialView = "cards",
  fromQuery = false,
}: {
  items: NotebookCardModel[];
  initialView?: WorkspaceView;
  fromQuery?: boolean;
}) {
  const { view, choose } = useWorkspaceView({ initialView, fromQuery });

  return (
    <div>
      <PageHeader
        className="mb-8"
        title="Notebooks"
        description={
          <span className="inline-flex items-center gap-1.5">
            Group sources, notes, extracts, and activities.
            <Popover>
              <PopoverTrigger
                aria-label="About notebook membership"
                className="rounded-full text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Info className="size-4" />
              </PopoverTrigger>
              <PopoverContent className="max-w-72 text-sm">
                Notebooks don&apos;t own their contents. The same item can
                appear in any number of notebooks.
              </PopoverContent>
            </Popover>
          </span>
        }
        actions={
          <>
            {items.length > 0 ? (
              <WorkspaceViewToggle view={view} onChange={choose} />
            ) : null}
            <Link
              href="/library/trash"
              className={cn(buttonVariants({ variant: "ghost", size: "touch" }))}
            >
              <Trash2 /> Recently deleted
            </Link>
            <NewNotebook />
          </>
        }
      />

      {items.length === 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <NewNotebook variant="card" />
        </div>
      ) : view === "list" ? (
        <div className="space-y-4">
          <NewNotebook variant="row" />
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((notebook) => (
              <NotebookRow key={notebook.id} notebook={notebook} />
            ))}
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <NewNotebook variant="card" />
          {items.map((notebook) => (
            <NotebookCard key={notebook.id} notebook={notebook} />
          ))}
        </div>
      )}
    </div>
  );
}

function DeleteNotebook({
  notebook,
  className,
}: {
  notebook: NotebookCardModel;
  className?: string;
}) {
  const router = useRouter();
  return (
    <Button
      size="icon-touch"
      variant="ghost"
      className={cn("text-muted-foreground hover:text-destructive", className)}
      aria-label={`Delete ${notebook.name}`}
      onClick={() =>
        void trashWithUndo(
          { type: "notebook", id: notebook.id },
          notebook.name,
          () => router.refresh(),
        )
      }
    >
      <Trash2 />
    </Button>
  );
}

function NotebookRow({ notebook }: { notebook: NotebookCardModel }) {
  return (
    <li className="flex items-center pr-2">
      <Link
        href={`/notebooks/${notebook.id}`}
        className="flex min-h-14 min-w-0 flex-1 items-start gap-3 px-4 py-3 text-sm"
      >
        <span
          className="mt-1.5 size-2.5 shrink-0 rounded-full"
          style={{ background: notebook.color }}
        />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{notebook.name}</div>
          <p className="text-xs text-muted-foreground">
            {notebook.description ?? "No description yet."}
          </p>
        </div>
        {notebook.due > 0 ? (
          <Badge>{notebook.due} due</Badge>
        ) : (
          <Badge variant="secondary">Caught up</Badge>
        )}
      </Link>
      <NotebookHistory notebookId={notebook.id} notebookName={notebook.name} />
      <DeleteNotebook notebook={notebook} />
    </li>
  );
}

function NotebookCard({ notebook }: { notebook: NotebookCardModel }) {
  const sparkHasReviews = notebook.spark.some((value) => value > 0);
  const { upload, busy, notice, supported } = useNotebookUpload(notebook.id);
  const { active, handlers } = useFileDrop((files) => void upload(files));

  return (
    <div className="group/notebook relative h-full">
    <Link href={`/notebooks/${notebook.id}`} {...handlers} draggable={false}>
      <Card
        className={cn(
          "relative h-full pt-0 transition-shadow hover:shadow-md",
          active && "ring-2 ring-primary",
        )}
      >
        {active || busy || notice ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex aspect-[16/10] items-center justify-center bg-background/80 px-4 text-center text-sm font-medium backdrop-blur-sm">
            <span className="flex items-center gap-2">
              <UploadCloud className="size-4 shrink-0" />
              {active
                ? `Drop ${supported} to add`
                : busy
                  ? "Adding…"
                  : notice?.text}
            </span>
          </div>
        ) : null}
        {notebook.coverSrc ? (
          <img
            src={notebook.coverSrc}
            alt={`Cover image for ${notebook.name}`}
            className="aspect-[16/10] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[16/10] items-center justify-center border-b border-dashed text-sm text-muted-foreground">
            No preview yet
          </div>
        )}
        <CardHeader>
          <div
            className="mb-2 h-1.5 w-10 rounded-full"
            style={{ background: notebook.color }}
          />
          <CardTitle>{notebook.name}</CardTitle>
          <CardDescription>
            {notebook.description ?? "No description yet."}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex items-end justify-between gap-4">
          <div>
            {notebook.due > 0 ? (
              <Badge>{notebook.due} due</Badge>
            ) : (
              <Badge variant="secondary">Caught up</Badge>
            )}
          </div>
          {sparkHasReviews ? (
            <div className="flex flex-col items-end gap-0.5">
              <Sparkline
                values={notebook.spark}
                color={notebook.color}
                className="h-8 w-28 text-primary"
              />
              <span className="text-[10px] text-muted-foreground">
                Reviews: last 90 days
              </span>
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">No reviews yet</span>
          )}
        </CardContent>
      </Card>
    </Link>
    <NotebookHistory
      notebookId={notebook.id}
      notebookName={notebook.name}
      alwaysVisible={false}
      className="absolute top-2 right-[3.25rem] z-20 bg-background/80 backdrop-blur-sm"
    />
    <DeleteNotebook
      notebook={notebook}
      className="absolute top-2 right-2 z-20 bg-background/80 backdrop-blur-sm pointer-fine:opacity-0 pointer-fine:transition-opacity pointer-fine:group-hover/notebook:opacity-100 pointer-fine:focus-visible:opacity-100"
    />
    </div>
  );
}
