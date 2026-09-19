import type OpenAI from "openai";
import { z } from "zod";
import { AiProviderError, AiUnconfiguredError } from "./errors";
import { parseJsonLoose } from "./json";
import {
  MAX_RETRY_AFTER_MS,
  type Provider,
  type ProviderId,
  chatProviders,
  describeError,
  isFailoverWorthy,
  looksLikeGuidedJsonRejection,
  markGuidedJsonUnsupported,
  retryAfterMs,
  sleep,
  supportsGuidedJson,
} from "./provider";

/**
 * The one entry point every generator uses. Walks providers in order, asks for
 * JSON, and refuses to return anything the caller's Zod schema rejects.
 */

export type ChatJsonRequest = {
  /** Used as the structured-output schema name, so keep it identifier-ish. */
  name: string;
  system: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** PLAN.md: "low" for extract candidates, "high" for drafting and generation. */
  reasoningEffort?: "low" | "high";
};

export type AiResult<T> = {
  value: T;
  provider: ProviderId;
  model: string;
  /** Model calls spent, including guided-output downgrades and repair retries. */
  attempts: number;
  guidedJson: boolean;
};

/** Guided downgrade, first parse, one repair. */
const CALL_BUDGET_PER_PROVIDER = 3;

const jsonSchemaCache = new WeakMap<z.ZodType, Record<string, unknown> | null>();

function jsonSchemaFor(schema: z.ZodType): Record<string, unknown> | null {
  const cached = jsonSchemaCache.get(schema);
  if (cached !== undefined) return cached;
  let converted: Record<string, unknown> | null = null;
  try {
    converted = z.toJSONSchema(schema, {
      io: "output",
      unrepresentable: "any",
    }) as Record<string, unknown>;
  } catch {
    // A schema we cannot express as JSON Schema just means prompt-only JSON.
    converted = null;
  }
  jsonSchemaCache.set(schema, converted);
  return converted;
}

function formatIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((issue) => {
      const path = issue.path.join(".") || "(root)";
      return `${path}: ${issue.message}`;
    })
    .join("; ");
}

type Repair = { previous: string; complaint: string };

function buildMessages(
  req: ChatJsonRequest,
  repair: Repair | undefined,
): OpenAI.ChatCompletionMessageParam[] {
  const messages: OpenAI.ChatCompletionMessageParam[] = [
    { role: "system", content: req.system },
    { role: "user", content: req.user },
  ];
  if (repair) {
    messages.push({ role: "assistant", content: repair.previous.slice(0, 4000) });
    messages.push({
      role: "user",
      content: `That response did not validate: ${repair.complaint}\n\nReturn corrected JSON only. No prose, no code fences, no commentary.`,
    });
  }
  return messages;
}

async function complete(
  provider: Provider,
  schema: z.ZodType,
  req: ChatJsonRequest,
  guided: boolean,
  repair: Repair | undefined,
): Promise<string> {
  const body: Record<string, unknown> = {
    model: provider.model,
    messages: buildMessages(req, repair),
    temperature: req.temperature ?? 0.2,
    [provider.maxTokensParam]: req.maxTokens,
  };
  if (req.reasoningEffort) body.reasoning_effort = req.reasoningEffort;

  if (guided) {
    const jsonSchema = jsonSchemaFor(schema);
    if (jsonSchema) {
      body.response_format = {
        type: "json_schema",
        json_schema: { name: req.name, schema: jsonSchema, strict: true },
      };
      // NVIDIA NIM's own spelling of the same request.
      body.nvext = { guided_json: jsonSchema };
    }
  }

  const response = await provider.client.chat.completions.create(
    body as unknown as OpenAI.ChatCompletionCreateParamsNonStreaming,
  );
  return response.choices[0]?.message?.content ?? "";
}

export async function chatJson<T>(
  schema: z.ZodType<T>,
  req: ChatJsonRequest,
): Promise<AiResult<T>> {
  const providers = chatProviders();
  if (providers.length === 0) throw new AiUnconfiguredError("chat");

  const failures: string[] = [];

  for (const provider of providers) {
    let guided = supportsGuidedJson(provider.id);
    let repair: Repair | undefined;
    let attempts = 0;

    for (let call = 0; call < CALL_BUDGET_PER_PROVIDER; call++) {
      attempts++;
      let raw: string;
      try {
        raw = await complete(provider, schema, req, guided, repair);
      } catch (error) {
        if (guided && looksLikeGuidedJsonRejection(error)) {
          markGuidedJsonUnsupported(provider.id);
          guided = false;
          continue;
        }
        if (isFailoverWorthy(error)) {
          const wait = retryAfterMs(error);
          if (wait !== undefined && wait <= MAX_RETRY_AFTER_MS) {
            await sleep(wait);
            continue;
          }
          failures.push(`${provider.label}: ${describeError(error)}`);
          break;
        }
        throw error;
      }

      const loose = parseJsonLoose(raw);
      let complaint: string;
      if (loose.ok) {
        const parsed = schema.safeParse(loose.value);
        if (parsed.success) {
          return {
            value: parsed.data,
            provider: provider.id,
            model: provider.model,
            attempts,
            guidedJson: guided,
          };
        }
        complaint = formatIssues(parsed.error);
      } else {
        complaint = loose.reason;
      }

      if (repair) {
        failures.push(`${provider.label}: invalid ${req.name} twice (${complaint})`);
        break;
      }
      repair = { previous: raw, complaint };
    }
  }

  throw new AiProviderError(failures);
}
