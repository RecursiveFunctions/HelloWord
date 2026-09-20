import { notebookSparkline } from "@/lib/seed";
import { dueCounts } from "@/lib/fsrs/queue";
import { notebookPreviewSrc } from "@/lib/store/previews";
import { listNotebooks } from "@/lib/store/notebooks";
import { resolveNotebookColor } from "@/lib/themes";
import { NotebookBrowser } from "./notebook-browser";

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

  const items = await Promise.all(
    notebooks.map(async (notebook) => {
      const color = resolveNotebookColor(notebook.color);
      return {
        id: notebook.id,
        name: notebook.name,
        description: notebook.description,
        color,
        due: byNotebook[notebook.id] ?? 0,
        spark: notebookSparkline({
          ...notebook,
          description: notebook.description ?? "",
          color,
        }),
        coverSrc: await notebookPreviewSrc(notebook.id),
      };
    }),
  );

  const fromQuery = viewParam === "list" || viewParam === "cards";

  return (
    <NotebookBrowser
      items={items}
      initialView={fromQuery ? viewParam : "cards"}
      fromQuery={fromQuery}
    />
  );
}
