import { advanceDraft, retryDraft } from "@/lib/distill/pipeline";
import { getDraft } from "@/lib/store/distill";
import { notFound, ok } from "../../../_respond";

type Context = { params: Promise<{ id: string }> };

export const runtime = "nodejs";
export const maxDuration = 60;

/** Where the draft has got to. Cheap; the triage screen polls it. */
export async function GET(_request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  const draft = await getDraft(id);
  return draft ? ok({ draft }) : notFound("Draft");
}

/**
 * Advance the draft by one stage: note first, cards on the next call. One model
 * call per request is what keeps this inside `maxDuration`, so the caller keeps
 * posting until the status is `ready`. `?retry=1` first puts a `failed` draft
 * back where it can resume.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  const { id } = await context.params;
  if (new URL(request.url).searchParams.get("retry") === "1") await retryDraft(id);
  const draft = await advanceDraft(id);
  return draft ? ok({ draft }) : notFound("Extract");
}
