"use client";

import { PageHeader } from "@/components/page-header";
import Link from "next/link";
import { UploadCloud } from "lucide-react";
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
        description="Saved collections of sources, notes, extracts, and activities. Nothing is owned by a notebook — membership is a join table, so one source can live in many places."
        actions={
          <>
            {items.length > 0 ? (
              <WorkspaceViewToggle view={view} onChange={choose} />
            ) : null}
            <NewNotebook />
          </>
        }
      />

      {items.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>No notebooks yet</EmptyTitle>
            <EmptyDescription>
              Create one, then drop files onto it or open it to add sources and notes.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : view === "list" ? (
        <ul className="divide-y rounded-xl border bg-card">
          {items.map((notebook) => (
            <NotebookRow key={notebook.id} notebook={notebook} />
          ))}
        </ul>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {items.map((notebook) => (
            <NotebookCard key={notebook.id} notebook={notebook} />
          ))}
        </div>
      )}
    </div>
  );
}

function NotebookRow({ notebook }: { notebook: NotebookCardModel }) {
  return (
    <li>
      <Link
        href={`/notebooks/${notebook.id}`}
        className="flex items-start gap-3 px-4 py-2.5 text-sm"
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
    </li>
  );
}

function NotebookCard({ notebook }: { notebook: NotebookCardModel }) {
  const sparkHasReviews = notebook.spark.some((value) => value > 0);
  const { upload, busy, notice, supported } = useNotebookUpload(notebook.id);
  const { active, handlers } = useFileDrop((files) => void upload(files));

  return (
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
            alt={`Screenshot of current content in ${notebook.name}`}
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
            <Sparkline
              values={notebook.spark}
              color={notebook.color}
              className="h-8 w-28 text-primary"
            />
          ) : (
            <span className="text-xs text-muted-foreground">No reviews yet</span>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}
