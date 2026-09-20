import { diagnosticsForNotebook } from "@/lib/diagnostics/notebook";
import { getNotebook } from "@/lib/store/notebooks";
import { notFound, ok } from "../../_respond";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ notebookId: string }> },
) {
  const { notebookId } = await params;
  if (!(await getNotebook(notebookId))) return notFound("Notebook");
  return ok(await diagnosticsForNotebook(notebookId));
}
