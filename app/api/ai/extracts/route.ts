import { AiExtractsBody, AiExtractsResponse } from "@/lib/api";
import { loadSource } from "@/lib/ai/data";
import { proposeExtracts } from "@/lib/ai/extracts";
import { aiErrorResponse, jsonError, parseBody, withProvider } from "@/lib/ai/http";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const body = await parseBody(request, AiExtractsBody);
  if (!body.ok) return body.response;

  try {
    const source = await loadSource(body.value.sourceId);
    if (!source) {
      return jsonError(
        404,
        "No source markdown to read.",
        "The source does not exist, or its ingest has not reached 'ready'. Nothing downstream of ingest sees anything but markdown.",
      );
    }

    const { proposals, provider, model } = await proposeExtracts(source);
    return withProvider(AiExtractsResponse.parse(proposals), { provider, model });
  } catch (error) {
    return aiErrorResponse(error);
  }
}
