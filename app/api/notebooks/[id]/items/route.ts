import { z } from "zod";
import { NotebookItemBody } from "@/lib/api";
import {
  addNotebookItems,
  getNotebook,
  listNotebookItems,
  removeNotebookItem,
} from "@/lib/store/notebooks";
import { referenceExists } from "@/lib/store/references";
import { fail, invalid, notFound, ok, readJson } from "../../../_respond";

/**
 * The frozen contract is one item per request. Adding a batch is the same shape
 * in an array, which is what the Library's multi-select sends.
 */
const AddBody = z.union([
  NotebookItemBody,
  z.object({ items: z.array(NotebookItemBody).min(1).max(200) }),
]);

export async function GET(
  _request: Request,
  context: RouteContext<"/api/notebooks/[id]/items">,
): Promise<Response> {
  const { id } = await context.params;
  if (!(await getNotebook(id))) return notFound("Notebook");
  return ok({ items: await listNotebookItems(id) });
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/notebooks/[id]/items">,
): Promise<Response> {
  const { id } = await context.params;
  if (!(await getNotebook(id))) return notFound("Notebook");

  const parsed = AddBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const items = "items" in parsed.data ? parsed.data.items : [parsed.data];

  const checks = await Promise.all(
    items.map((item) => referenceExists(item.item_type, item.item_id)),
  );
  const missing = items.filter((_, index) => !checks[index]);
  if (missing.length > 0) {
    return fail(
      `No such ${missing[0].item_type}: ${missing[0].item_id}. A notebook may only reference rows that exist.`,
      422,
    );
  }

  const added = await addNotebookItems(id, items);
  return ok({ added, requested: items.length }, 201);
}

export async function DELETE(
  request: Request,
  context: RouteContext<"/api/notebooks/[id]/items">,
): Promise<Response> {
  const { id } = await context.params;
  const params = new URL(request.url).searchParams;

  const parsed = NotebookItemBody.safeParse({
    item_type: params.get("item_type"),
    item_id: params.get("item_id"),
  });
  if (!parsed.success) return invalid(parsed.error);

  const removed = await removeNotebookItem(
    id,
    parsed.data.item_type,
    parsed.data.item_id,
  );
  if (!removed) return notFound("Notebook item");
  return ok({ removed: parsed.data });
}
