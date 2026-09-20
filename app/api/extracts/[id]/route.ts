import { PatchExtractBody } from "@/lib/api";
import { applyReadingAction } from "@/lib/reading/queue";
import { invalid, notFound, ok, readJson } from "../../_respond";

type Context = { params: Promise<{ id: string }> };

/**
 * Reprioritise an extract or move it through the reading queue. The body text
 * and selector are not patchable: an extract is a verbatim span of an immutable
 * source, so "editing" one means making a different extract.
 */
export async function PATCH(request: Request, context: Context): Promise<Response> {
  const parsed = PatchExtractBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { id } = await context.params;
  const extract = await applyReadingAction(id, parsed.data);
  return extract ? ok({ extract }) : notFound("Extract");
}
