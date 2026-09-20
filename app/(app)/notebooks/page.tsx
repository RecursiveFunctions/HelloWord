import { notebookTrends } from "@/lib/diagnostics/notebook";
import { dueCounts } from "@/lib/fsrs/queue";
import { listNotebooks } from "@/lib/store/notebooks";
import { notebookPreviewSrc } from "@/lib/store/previews";
import { resolveNotebookColor } from "@/lib/themes";
import { NotebookBrowser } from "./notebook-browser";
import { isWorkspaceView } from "./workspace-view";

export const dynamic = "force-dynamic";

export default async function NotebooksPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const [{ view: viewParam }, notebooks, { byNotebook }] = await Promise.all([
    searchParams,
    listNotebooks(),
    dueCounts(),
  ]);
  const trends = await notebookTrends(notebooks.map((notebook) => notebook.id));

  const items = await Promise.all(
    notebooks.map(async (notebook) => {
      const color = resolveNotebookColor(notebook.color);
      return {
        id: notebook.id,
        name: notebook.name,
        description: notebook.description,
        color,
        due: byNotebook[notebook.id] ?? 0,
        spark: trends[notebook.id] ?? [],
        coverSrc: await notebookPreviewSrc(notebook.id),
      };
    }),
  );

  const fromQuery = viewParam === "list" || viewParam === "cards";
  const initialView =
    fromQuery && isWorkspaceView(viewParam) ? viewParam : "cards";

  return (
    <NotebookBrowser
      items={items}
      initialView={initialView}
      fromQuery={fromQuery}
    />
  );
}
