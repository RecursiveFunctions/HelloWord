import { AiNoteBody, AiNoteResponse } from "@/lib/api";
import { loadExtracts } from "@/lib/ai/data";
import { aiErrorResponse, jsonError, parseBody, withProvider } from "@/lib/ai/http";
import { draftNote } from "@/lib/ai/note";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await parseBody(request, AiNoteBody);
  if (!body.ok) return body.response;

  try {
    const extracts = await loadExtracts(body.value.extractIds);
    if (extracts.length === 0) {
      return jsonError(404, "None of those extracts exist.");
    }

    const { draft, provider, model } = await draftNote(extracts);
    return withProvider(AiNoteResponse.parse(draft), { provider, model });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
