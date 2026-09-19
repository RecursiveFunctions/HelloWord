import { AiActivitiesBody, AiActivitiesResponse } from "@/lib/api";
import { generateActivities } from "@/lib/ai/activities";
import { loadNote } from "@/lib/ai/data";
import { aiErrorResponse, jsonError, parseBody, withProvider } from "@/lib/ai/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await parseBody(request, AiActivitiesBody);
  if (!body.ok) return body.response;

  try {
    const note = await loadNote(body.value.noteId);
    if (!note) return jsonError(404, "That note does not exist.");

    const { batch, provider, model } = await generateActivities(
      note,
      body.value.types,
      body.value.count,
    );
    return withProvider(AiActivitiesResponse.parse(batch), { provider, model });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
