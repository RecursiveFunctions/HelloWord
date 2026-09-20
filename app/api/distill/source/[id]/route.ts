import { distillExtracts } from "@/lib/distill/pipeline";
import { fail, notFound, ok } from "../../../_respond";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
/** One model call, which may take 45 of these. */
export const maxDuration = 60;

/**
 * Propose extracts for a source. Ingest calls the same function from `after()`;
 * this route exists for when that ran out of time or the model was down, and
 * for sources that were ingested before the pipeline existed.
 *
 * `?force=1` re-runs a source that is already `proposed` or looks stuck in
 * `extracting`. Passages it already has, at any status, are not proposed again.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const force = new URL(request.url).searchParams.get("force") === "1";
  const source = await distillExtracts(id, { force });
  if (!source) return notFound("Source");
  if (source.ingest_status !== "ready") {
    return fail("The source is not ready to distill.", 409);
  }
  return ok({
    distill_status: source.distill_status,
    distill_error: source.distill_error,
  });
}
