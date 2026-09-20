import { readingSnapshot } from "@/lib/reading/queue";
import { ok } from "../../_respond";

export const dynamic = "force-dynamic";

/** `?pending=1` includes AI proposals nobody has accepted yet. */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get("limit"));
  return ok(
    await readingSnapshot({
      includePending: params.get("pending") === "1",
      limit: Number.isInteger(limit) && limit > 0 ? Math.min(limit, 200) : undefined,
    }),
  );
}
