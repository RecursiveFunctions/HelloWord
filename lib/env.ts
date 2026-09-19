/**
 * Server-only settings. Import from route handlers, not Client Components.
 * Secrets live in `.env.local` (gitignored). Next.js loads that file automatically.
 *
 * AI_MOCK defaults on. A/B/D should leave it that way and use fixtures.
 * C flips it off only when calling a live model.
 */
function read(name: string): string | undefined {
  const value = process.env[name];
  return value && value.length > 0 ? value : undefined;
}

export const env = {
  aiMock: process.env.AI_MOCK !== "0",
  databaseUrl: read("DATABASE_URL"),
  nvidia: {
    apiKey: read("NVIDIA_API_KEY"),
    baseUrl: read("NVIDIA_BASE_URL") ?? "https://integrate.api.nvidia.com/v1",
    model: read("NVIDIA_MODEL") ?? "nvidia/nemotron-3-super-120b-a12b",
  },
  digitalOcean: {
    apiKey: read("DO_INFERENCE_KEY"),
    baseUrl: read("DO_INFERENCE_BASE_URL") ?? "https://inference.do-ai.run/v1",
    model: read("DO_NEMOTRON_MODEL") ?? "nemotron-3-nano-30b",
  },
  snowflake: {
    account: read("SNOWFLAKE_ACCOUNT"),
    pat: read("SNOWFLAKE_PAT"),
    model: read("SNOWFLAKE_MODEL") ?? "claude-sonnet-4-5",
  },
  gemini: {
    apiKey: read("GEMINI_API_KEY"),
  },
  spaces: {
    key: read("SPACES_KEY"),
    secret: read("SPACES_SECRET"),
    bucket: read("SPACES_BUCKET"),
    endpoint: read("SPACES_ENDPOINT") ?? "https://nyc3.digitaloceanspaces.com",
  },
};

export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(
      `Missing ${name}. Put it in .env.local (gitignored). Do not commit secrets.`,
    );
  }
  return value;
}
