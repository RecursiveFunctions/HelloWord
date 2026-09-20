import { z } from "zod";
import { CreateExtractBody } from "@/lib/api";
import { SelectorBundle } from "@/lib/contracts/anchor";
import { createExtract } from "@/lib/store/extracts";
import { getSource } from "@/lib/store/sources";
import { fail, invalid, notFound, ok, readJson } from "../_respond";

const NemotronExtractBody = CreateExtractBody.extend({
  source_id: z.string().uuid(),
  note_id: z.undefined().optional(),
  selector: SelectorBundle,
  suggested_by: z.literal("nemotron").default("nemotron"),
  reason: z.string().trim().max(500).optional(),
  concepts: z.array(z.string().trim().min(1).max(80)).max(5).default([]),
});

export async function POST(request: Request): Promise<Response> {
  const parsed = NemotronExtractBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const source = await getSource(parsed.data.source_id);
  if (!source) return notFound("Source not found.");
  if (source.ingest_status !== "ready" || source.markdown === null) {
    return fail("The source is not ready for extracts.", 409);
  }

  const { selector, body_md } = parsed.data;
  if (
    selector.start < 0 ||
    selector.end > source.markdown.length ||
    selector.end <= selector.start ||
    source.markdown.slice(selector.start, selector.end) !== body_md ||
    selector.exact !== body_md
  ) {
    return fail("The selector does not identify body_md in the immutable source.");
  }

  const result = await createExtract(parsed.data);
  return ok(
    { extract: result.extract, duplicate: !result.created },
    result.created ? 201 : 200,
  );
}