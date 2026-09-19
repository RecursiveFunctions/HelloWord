/** Errors the API routes translate into status codes. */

/** No provider has a key. Nothing to call, and mock mode is off. */
export class AiUnconfiguredError extends Error {
  constructor(what = "chat") {
    super(
      `No ${what} provider is configured. Set NVIDIA_API_KEY (or DO_INFERENCE_KEY) in .env.local, or leave AI_MOCK=1.`,
    );
    this.name = "AiUnconfiguredError";
  }
}

/** Every provider was tried and every one failed. */
export class AiProviderError extends Error {
  readonly failures: string[];

  constructor(failures: string[]) {
    super(`All AI providers failed: ${failures.join(" | ")}`);
    this.name = "AiProviderError";
    this.failures = failures;
  }
}
