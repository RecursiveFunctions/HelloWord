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

/** Longest `Retry-After` we will sit through before moving to the next provider. */
export const MAX_RETRY_AFTER_MS = 2_000;

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

function statusOf(error: unknown): number | undefined {
  return error instanceof APIError ? error.status : undefined;
}

/**
 * 401 and 403 are in here because a fresh NVIDIA key has been observed
 * returning 403 on /chat/completions while GET /v1/models returns 200.
 * A dead primary key should move us to the failover, not fail the request.
 */
export function isFailoverWorthy(error: unknown): boolean {
  const status = statusOf(error);
  if (status === undefined) return true; // connection reset, timeout, DNS
  if (status === 429) return true;
  if (status >= 500) return true;
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
    return `${error.status ?? "no status"} ${error.message}`.slice(0, 300);
  }
  return (error instanceof Error ? error.message : String(error)).slice(0, 300);
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
