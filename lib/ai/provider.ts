import OpenAI, { APIError } from "openai";
import { env } from "../env";

/**
 * Both NVIDIA and DigitalOcean speak OpenAI Chat Completions, so one client
 * shape covers both and failover is a `baseURL` swap. The differences that
 * remain are per-provider quirks, so they live on the provider record rather
 * than at the call sites.
 *
 * Server-only. Do not import from a Client Component.
 */

export type ProviderId = "nvidia" | "digitalocean";

export type Provider = {
  id: ProviderId;
  label: string;
  baseUrl: string;
  model: string;
  /** DigitalOcean serverless inference rejects `max_tokens`. */
  maxTokensParam: "max_tokens" | "max_completion_tokens";
  client: OpenAI;
};

const TIMEOUT_MS = 45_000;

/**
 * Not in lib/env.ts because that file is frozen shared surface. Read at call
 * time so a script that loads .env.local after import still sees it.
 */
function embedModel(): string {
  const configured = process.env.NVIDIA_EMBED_MODEL;
  return configured && configured.length > 0
    ? configured
    : "nvidia/nemotron-3-embed-1b";
}

/** Longest delay we will sit through before moving to the next provider. */
export const MAX_RETRY_DELAY_MS = 2_000;
const BASE_RETRY_DELAY_MS = 250;
const TRANSIENT_STATUSES = new Set([429, 502, 503, 504]);

const clients = new Map<string, OpenAI>();

function clientFor(baseUrl: string, apiKey: string): OpenAI {
  const cacheKey = `${baseUrl}\u0000${apiKey}`;
  const existing = clients.get(cacheKey);
  if (existing) return existing;
  // We own retries and failover, so the SDK must not retry behind our back.
  const client = new OpenAI({
    baseURL: baseUrl,
    apiKey,
    maxRetries: 0,
    timeout: TIMEOUT_MS,
  });
  clients.set(cacheKey, client);
  return client;
}

/**
 * NVIDIA first, DigitalOcean as failover. A provider without a key is left out
 * entirely, so a missing DO_INFERENCE_KEY degrades to NVIDIA-only.
 */
export function chatProviders(): Provider[] {
  const providers: Provider[] = [];
  if (env.nvidia.apiKey) {
    providers.push({
      id: "nvidia",
      label: "NVIDIA",
      baseUrl: env.nvidia.baseUrl,
      model: env.nvidia.model,
      maxTokensParam: "max_tokens",
      client: clientFor(env.nvidia.baseUrl, env.nvidia.apiKey),
    });
  }
  if (env.digitalOcean.apiKey) {
    providers.push({
      id: "digitalocean",
      label: "DigitalOcean",
      baseUrl: env.digitalOcean.baseUrl,
      model: env.digitalOcean.model,
      maxTokensParam: "max_completion_tokens",
      client: clientFor(env.digitalOcean.baseUrl, env.digitalOcean.apiKey),
    });
  }
  return providers;
}

/**
 * Embeddings are NVIDIA-only on purpose. See lib/ai/embeddings.ts: DigitalOcean
 * hosts a different embedding model, and a different vector space in the same
 * `vector(768)` column would corrupt cosine distance silently.
 */
export function embeddingProvider(): Provider | null {
  if (!env.nvidia.apiKey) return null;
  return {
    id: "nvidia",
    label: "NVIDIA",
    baseUrl: env.nvidia.baseUrl,
    model: embedModel(),
    maxTokensParam: "max_tokens",
    client: clientFor(env.nvidia.baseUrl, env.nvidia.apiKey),
  };
}

export function statusOf(error: unknown): number | undefined {
  return error instanceof APIError ? error.status : undefined;
}

/**
 * Only overload and gateway failures are worth repeating against the same
 * provider. Authentication, model and validation failures can still fail over,
 * but retrying them first only burns the request budget.
 */
export function isTransientProviderError(error: unknown): boolean {
  const status = statusOf(error);
  return status === undefined || TRANSIENT_STATUSES.has(status);
}

/**
 * 401 and 403 are included because a key can work on a model-list endpoint but
 * not on chat completions. A provider-specific failure should not prevent the
 * configured secondary provider from serving the request.
 */
export function isFailoverWorthy(error: unknown): boolean {
  const status = statusOf(error);
  if (isTransientProviderError(error)) return true;
  return status === 401 || status === 403 || status === 404 || status === 408;
}

export function retryAfterMs(error: unknown): number | undefined {
  if (!(error instanceof APIError)) return undefined;
  const header = error.headers?.get?.("retry-after");
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return seconds * 1000;
  const date = Date.parse(header);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}

/** Bounded exponential backoff with jitter, overridden by a short Retry-After. */
export function retryDelayMs(error: unknown, retry: number): number {
  const requested = retryAfterMs(error);
  if (requested !== undefined) {
    return Math.min(MAX_RETRY_DELAY_MS, Math.max(0, requested));
  }
  const exponential = BASE_RETRY_DELAY_MS * 2 ** Math.max(0, retry);
  const jitter = 0.75 + Math.random() * 0.5;
  return Math.min(MAX_RETRY_DELAY_MS, Math.round(exponential * jitter));
}

const GUIDED_JSON_REJECTION =
  /guided_json|nvext|response_format|json_schema|unsupported.*(parameter|field)|extra inputs are not permitted/i;

/**
 * PLAN.md flags structured output as unconfirmed on NVIDIA's hosted gateway.
 * A 400 naming the parameter means this provider wants prompt-only JSON.
 */
export function looksLikeGuidedJsonRejection(error: unknown): boolean {
  if (statusOf(error) !== 400) return false;
  const message = error instanceof Error ? error.message : String(error);
  return GUIDED_JSON_REJECTION.test(message);
}

const guidedJsonUnsupported = new Set<ProviderId>();

export function supportsGuidedJson(id: ProviderId): boolean {
  return !guidedJsonUnsupported.has(id);
}

/**
 * Remembered for the lifetime of the process, so a gateway that rejects
 * structured output costs one 400 per cold start rather than one per call.
 */
export function markGuidedJsonUnsupported(id: ProviderId): void {
  guidedJsonUnsupported.add(id);
}

export function describeError(error: unknown): string {
  if (error instanceof APIError) {
    return `HTTP ${error.status ?? "unknown"}`;
  }
  const name = error instanceof Error ? error.name : "UnknownError";
  return name.replace(/[^A-Za-z0-9_.-]/g, "").slice(0, 80) || "UnknownError";
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
