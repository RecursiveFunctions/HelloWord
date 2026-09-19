import { getSource } from "@/lib/store/sources";
import { notFound, ok } from "../../_respond";

/**
 * Poll target for ingest. `?fields=status` omits the markdown body, because a
 * client polling every second does not want to re-download the document.
 */
export async function GET(
  request: Request,
  context: RouteContext<"/api/sources/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const source = await getSource(id);
  if (!source) return notFound("Source");

  const statusOnly =
    new URL(request.url).searchParams.get("fields") === "status";

  return ok({
    source: statusOnly ? { ...source, markdown: null } : source,
  });
}
