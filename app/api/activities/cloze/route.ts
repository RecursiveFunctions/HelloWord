import { ManualClozeBody } from "@/lib/api";
import type { ActivityPayload } from "@/lib/contracts/activity";
import { getExtract } from "@/lib/store/extracts";
import { createManualCloze } from "@/lib/store/review";
import { fail, invalid, notFound, ok, readJson } from "../../_respond";

export async function POST(request: Request): Promise<Response> {
  const parsed = ManualClozeBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const extract = await getExtract(parsed.data.extract_id);
  if (!extract) return notFound("Extract");
  const { start, end } = parsed.data;
  if (end > extract.body_md.length) {
    return fail("The cloze range is outside the extract.");
  }
  const answer = extract.body_md.slice(start, end);
  if (!answer.trim()) return fail("A cloze must hide non-whitespace text.");

  const template = `${extract.body_md.slice(0, start)}{{1}}${extract.body_md.slice(end)}`;
  const payload: Extract<ActivityPayload, { type: "fill_blank" }> = {
    type: "fill_blank",
    template,
    blanks: [{ id: 1, accepted: [answer] }],
  };
  const result = await createManualCloze(extract.id, payload);
  return ok(
    { activity: result.activity, duplicate: !result.created },
    result.created ? 201 : 200,
  );
}