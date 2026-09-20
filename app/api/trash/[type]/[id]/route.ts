import { z } from "zod";
import { TRASH_TYPES, purgeItem, restoreItem } from "@/lib/store/trash";
import { fail, notFound, ok } from "../../../_respond";

const Params = z.object({ type: z.enum(TRASH_TYPES), id: z.string().uuid() });

export async function POST(
  _request: Request,
  context: RouteContext<"/api/trash/[type]/[id]">,
): Promise<Response> {
  const parsed = Params.safeParse(await context.params);
  if (!parsed.success) return fail("Unknown trash item.", 422);

  const restored = await restoreItem(parsed.data.type, parsed.data.id);
  if (!restored) return notFound(parsed.data.type);
  return ok({ restored: parsed.data });
}

/** Delete forever. Only works on something already in Recently deleted. */
export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/trash/[type]/[id]">,
): Promise<Response> {
  const parsed = Params.safeParse(await context.params);
  if (!parsed.success) return fail("Unknown trash item.", 422);

  const purged = await purgeItem(parsed.data.type, parsed.data.id);
  if (!purged) return notFound(parsed.data.type);
  return ok({ purged: parsed.data });
}
