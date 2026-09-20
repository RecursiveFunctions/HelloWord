import { z } from "zod";
import { deleteCoverBlob } from "@/lib/store/covers";
import {
  getNotebook,
  listNotebookItems,
  updateNotebook,
} from "@/lib/store/notebooks";
import { trashItem } from "@/lib/store/trash";
import { invalid, notFound, ok, readJson } from "../../_respond";

const PatchNotebookBody = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  color: z
    .string()
    .regex(
      /^(#[0-9a-fA-F]{6}|oklch\([^)]+\))$/,
      "Use a six-digit hex colour or an oklch() swatch.",
    )
    .nullable()
    .optional(),
  cover_storage_key: z.null().optional(),
});

export async function GET(
  _request: Request,
  context: RouteContext<"/api/notebooks/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const notebook = await getNotebook(id);
  if (!notebook) return notFound("Notebook");

  return ok({ notebook, items: await listNotebookItems(id) });
}

export async function PATCH(
  request: Request,
  context: RouteContext<"/api/notebooks/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const parsed = PatchNotebookBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const notebook = await updateNotebook(id, parsed.data);
  if (!notebook) return notFound("Notebook");
  if (parsed.data.cover_storage_key === null) deleteCoverBlob(id);
  return ok({ notebook });
}

/**
 * Deleting a notebook moves it to Recently deleted. Its membership rows stay
 * put and no source or note is touched: a notebook references them, it never
 * owns them.
 */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/notebooks/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const deleted = await trashItem("notebook", id);
  if (!deleted) return notFound("Notebook");
  return ok({ deleted: id });
}
