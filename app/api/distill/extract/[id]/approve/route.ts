import { ApproveDraftBody } from "@/lib/api";
import { DraftNotReadyError, approveDraft } from "@/lib/distill/pipeline";
import { fail, invalid, notFound, ok, readJson } from "../../../../_respond";

type Context = { params: Promise<{ id: string }> };

/**
 * The only door from a draft to a real note and reviewable cards. The body is
 * what the reader approved - their edits, their choice of cards - not what the
 * model wrote.
 */
export async function POST(request: Request, context: Context): Promise<Response> {
  const parsed = ApproveDraftBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);
  const { id } = await context.params;
  try {
    const result = await approveDraft(id, parsed.data);
    return result ? ok(result, 201) : notFound("Extract");
  } catch (error) {
    if (error instanceof DraftNotReadyError) return fail(error.message, 409);
    throw error;
  }
}
