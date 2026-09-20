import { z } from "zod";
import { TRASH_TYPES, emptyTrash, listTrash, purgeExpired, trashItem } from "@/lib/store/trash";
import { invalid, notFound, ok, readJson } from "../_respond";

const TrashBody = z.object({
  type: z.enum(TRASH_TYPES),
  id: z.string().uuid(),
});

export async function GET(): Promise<Response> {
  await purgeExpired();
  return ok({ entries: await listTrash() });
}

/** Move one item to Recently deleted. Restore is `POST /api/trash/[type]/[id]`. */
export async function POST(request: Request): Promise<Response> {
  const parsed = TrashBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const trashed = await trashItem(parsed.data.type, parsed.data.id);
  if (!trashed) return notFound(parsed.data.type);
  return ok({ trashed: parsed.data }, 201);
}

export async function DELETE(): Promise<Response> {
  return ok({ purged: await emptyTrash() });
}
