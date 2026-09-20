import type OpenAI from "openai";
import { z } from "zod";
import { AiProviderError, AiUnconfiguredError } from "./errors";
import { answerText, parseJsonLoose } from "./json";
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
  /** Normalize a common provider shape before applying the authoritative schema. */
  normalize?: (value: unknown) => unknown;
  /**
   * Epoch ms after which no further model call may start. The hosting platform
   * kills a route that overruns its `maxDuration` and answers the browser with
   * a plain-text error page, so the retry ladder has to give up first and
   * return a real JSON failure while it still can.
   */
  deadline?: number;
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

/**
 * Default wall clock for the whole ladder. Under the 60s `maxDuration` the AI
 * routes declare, with room left to load the note and serialize the answer.
 */
export const DEFAULT_BUDGET_MS = 45_000;
/** Starting a call with less than this left only burns the remaining time. */
export const MIN_CALL_MS = 6_000;

export function defaultDeadline(): number {
  return Date.now() + DEFAULT_BUDGET_MS;
}

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
  timeoutMs: number,
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
    { timeout: timeoutMs },
  );
  const choice = response.choices[0];
  return {
    raw: choice?.message?.content ?? "",
    finishReason: choice?.finish_reason ?? null,
  };
}

/**
 * Scans the answer, not the raw response: a `<think>` trace is prose, and one
 * stray brace in it used to make this report a cut-off answer as well formed,
 * which sent the repair round trip the wrong instruction.
 */
export function looksTruncated(raw: string, finishReason: string | null): boolean {
  if (finishReason === "length") return true;
  const trimmed = answerText(raw);
  if (!trimmed) return false;
  if (/[,:[{]\s*$/.test(trimmed)) return true;
  const stack: string[] = [];
  let quoted = false;
  let escaped = false;
  let expectingValue = false;
  for (let index = 0; index < trimmed.length; index++) {
    const char = trimmed[index];
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
      if (!quoted) expectingValue = false;
      continue;
    }
    if (quoted) continue;
    if (char === "{" || char === "[") {
      stack.push(char);
      expectingValue = false;
    } else if (char === "}" || char === "]") {
      const expected = char === "}" ? "{" : "[";
      if (stack.at(-1) === expected) stack.pop();
      else return false;
      expectingValue = false;
    } else if (char === ":" || char === ",") {
      expectingValue = true;
    } else if (!/\s/.test(char)) {
      expectingValue = false;
    }
  }
  return quoted || stack.length > 0 || expectingValue;
}

export async function chatJson<T>(
  schema: z.ZodType<T>,
  req: ChatJsonRequest,
): Promise<AiResult<T>> {
  const providers = chatProviders();
  if (providers.length === 0) throw new AiUnconfiguredError("chat");

  const deadline = req.deadline ?? defaultDeadline();
  const failures: string[] = [];
  let ranOutOfTime = false;

  for (const provider of providers) {
    if (ranOutOfTime) break;
    let guided = supportsGuidedJson(provider.id);
    let repair: Repair | undefined;
    let attempts = 0;
    let transportRetries = 0;

    for (let call = 0; call < CALL_BUDGET_PER_PROVIDER; call++) {
      const remaining = deadline - Date.now();
      if (remaining < MIN_CALL_MS) {
        failures.push(
          `${provider.label}: ${req.name} ran out of time after ${attempts} attempt${attempts === 1 ? "" : "s"}`,
        );
        ranOutOfTime = true;
        break;
      }
      attempts++;
      let completion: Completion;
      try {
        completion = await complete(provider, schema, req, guided, repair, remaining);
      } catch (error) {
        if (guided && looksLikeGuidedJsonRejection(error)) {
          markGuidedJsonUnsupported(provider.id);
          guided = false;
          continue;
        }
        if (isTransientProviderError(error) && transportRetries < MAX_TRANSPORT_RETRIES) {
          await sleep(Math.min(retryDelayMs(error, transportRetries), Math.max(0, deadline - Date.now())));
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
        const parsed = schema.safeParse(
          req.normalize ? req.normalize(loose.value) : loose.value,
        );
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
          `${provider.label}: invalid ${req.name} after structured repair (${truncated ? `output was cut off at the ${req.maxTokens}-token limit` : complaint})`,
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
