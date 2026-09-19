import type { z } from "zod";
import { AiProviderError, AiUnconfiguredError } from "./errors";

/**
 * Shared shape for the four AI routes. One error body, one provider header,
 * so callers can tell "you asked wrong" from "every model refused" without
 * reading prose.
 */

export type ErrorBody = { error: string; detail?: string };

export function jsonError(status: number, error: string, detail?: string): Response {
  return Response.json({ error, detail } satisfies ErrorBody, { status });
}

/** Names which provider served the response — evidence that failover is real. */
export function withProvider(
  data: unknown,
  meta: { provider: string; model: string },
): Response {
  return Response.json(data, {
    headers: {
      "x-ai-provider": meta.provider,
      "x-ai-model": meta.model,
      "cache-control": "no-store",
    },
  });
}

export async function parseBody<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<{ ok: true; value: T } | { ok: false; response: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { ok: false, response: jsonError(400, "Body must be JSON.") };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      response: jsonError(
        400,
        "Request body does not match the contract.",
        parsed.error.issues
          .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
          .join("; "),
      ),
    };
  }
  return { ok: true, value: parsed.data };
}

/**
 * 503 means "configure a key or leave AI_MOCK=1". 424 means the request was
 * fine but no provider produced something the contract accepts, so a client
 * can offer a retry instead of reporting a bug.
 */
export function aiErrorResponse(error: unknown): Response {
  if (error instanceof AiUnconfiguredError) {
    return jsonError(503, "No AI provider configured.", error.message);
  }
  if (error instanceof AiProviderError) {
    return jsonError(424, "Every AI provider failed.", error.failures.join(" | "));
  }
  console.error("[ai] unhandled error", error);
  return jsonError(
    500,
    "AI request failed.",
    error instanceof Error ? error.message : String(error),
  );
}
