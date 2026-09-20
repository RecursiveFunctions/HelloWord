import type OpenAI from "openai";
import { z } from "zod";
import { AiProviderError, AiUnconfiguredError } from "./errors";
import { parseJsonLoose } from "./json";
import {
  type Provider,
  type ProviderId,
  chatProviders,
  describeError,
  isFailoverWorthy,
  isTransientProviderError,
  looksLikeGuidedJsonRejection,
  markGuidedJsonUnsupported,
  retryDelayMs,
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

/** Includes transport retries, guided downgrade, and one structured repair. */
const CALL_BUDGET_PER_PROVIDER = 4;
const MAX_TRANSPORT_RETRIES = 2;

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

type Repair = { previous: string; complaint: string; truncated: boolean };

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
      content: repair.truncated
        ? "That JSON response was cut off before it finished. Return the complete JSON object again, more compactly. Preserve the requested shape and omit nonessential verbosity. No prose, no code fences, no commentary."
        : `That response did not validate: ${repair.complaint}\n\nReturn corrected JSON only. No prose, no code fences, no commentary.`,
    });
  }
  return messages;
}

type Completion = { raw: string; finishReason: string | null };

async function complete(
  provider: Provider,
  schema: z.ZodType,
  req: ChatJsonRequest,
  guided: boolean,
  repair: Repair | undefined,
): Promise<Completion> {
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
  const choice = response.choices[0];
  return {
    raw: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
  };
}

function looksTruncated(raw: string, finishReason: string | null): boolean {
  if (finishReason === "length") return true;
  const trimmed = raw.trim();
  if (!trimmed) return false;
  if (/[,:[{]\s*$/.test(trimmed)) return true;
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (const char of trimmed) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\" && quoted) {
      escaped = true;
      continue;
    }
    if (char === '"') {
      quoted = !quoted;
      continue;
    }
    if (!quoted && (char === "{" || char === "[")) depth++;
    if (!quoted && (char === "}" || char === "]")) depth--;
  }
  return quoted || depth > 0;
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
    let transportRetries = 0;

    for (let call = 0; call < CALL_BUDGET_PER_PROVIDER; call++) {
      attempts++;
      let completion: Completion;
      try {
        completion = await complete(provider, schema, req, guided, repair);
      } catch (error) {
        if (guided && looksLikeGuidedJsonRejection(error)) {
          markGuidedJsonUnsupported(provider.id);
          guided = false;
          continue;
        }
        if (isTransientProviderError(error) && transportRetries < MAX_TRANSPORT_RETRIES) {
          await sleep(retryDelayMs(error, transportRetries));
          transportRetries++;
          continue;
        }
        if (isFailoverWorthy(error)) {
          failures.push(`${provider.label}: ${describeError(error)}`);
          break;
        }
        throw error;
      }

      transportRetries = 0;
      const { raw, finishReason } = completion;
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

      const truncated = looksTruncated(raw, finishReason);
      if (repair) {
        failures.push(
          `${provider.label}: invalid ${req.name} after structured repair (${truncated ? "truncated output" : complaint})`,
        );
        break;
      }
      repair = { previous: raw, complaint, truncated };
    }

    if (attempts >= CALL_BUDGET_PER_PROVIDER && failures.at(-1)?.startsWith(provider.label) !== true) {
      failures.push(`${provider.label}: ${req.name} exhausted its call budget`);
    }
  }

  throw new AiProviderError(failures);
}
