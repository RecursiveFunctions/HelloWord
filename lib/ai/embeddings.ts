import { env } from "../env";
import { AiProviderError, AiUnconfiguredError } from "./errors";
import { deterministicVector } from "./mock";
import {
  describeError,
  embeddingProvider,
  isTransientProviderError,
  retryDelayMs,
  sleep,
} from "./provider";

/**
 * Embeddings for `extract.embedding` and `note.embedding`, both `vector(768)`.
 *
 * `input_type` is the thing to get right: `passage` when indexing, `query` when
 * searching. Swapping them does not error, it just quietly tanks retrieval
 * accuracy, which is the worst kind of bug to have during a demo.
 */

/** Matches vector(768) in db/schema.sql. Changing it is a contract change. */
export const EMBED_DIMS = 768;

/** Well inside the 1-2048 inputs both gateways document. */
const BATCH_SIZE = 64;
const ATTEMPTS = 2;

export type InputType = "passage" | "query";

/**
 * Matryoshka truncation leaves the vector off the unit sphere, and cosine
 * distance in pgvector assumes nothing but still reads better normalized, so
 * renormalize after cutting.
 */
function toDims(vector: number[]): number[] {
  if (vector.length < EMBED_DIMS) {
    throw new AiProviderError([
      `embedding model returned ${vector.length} dimensions, fewer than the ${EMBED_DIMS} that vector(768) needs. Set NVIDIA_EMBED_MODEL to a model with at least ${EMBED_DIMS} dimensions.`,
    ]);
  }
  const truncated = vector.slice(0, EMBED_DIMS);
  const norm = Math.sqrt(truncated.reduce((acc, value) => acc + value * value, 0));
  return norm > 0 ? truncated.map((value) => value / norm) : truncated;
}

async function embedBatch(texts: string[], inputType: InputType): Promise<number[][]> {
  const provider = embeddingProvider();
  if (!provider) {
    throw new AiUnconfiguredError("embedding");
  }

  const failures: string[] = [];
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await provider.client.embeddings.create({
        model: provider.model,
        input: texts,
        // NVIDIA NIM's retrieval models split the two directions here.
        input_type: inputType,
        truncate: "END",
      } as unknown as Parameters<typeof provider.client.embeddings.create>[0]);
      return response.data
        .sort((a, b) => a.index - b.index)
        .map((item) => toDims(item.embedding));
    } catch (error) {
      if (attempt < ATTEMPTS && isTransientProviderError(error)) {
        await sleep(retryDelayMs(error, attempt - 1));
        failures.push(`${provider.label}: ${describeError(error)}`);
        continue;
      }
      if (error instanceof AiProviderError) throw error;
      throw new AiProviderError([...failures, `${provider.label}: ${describeError(error)}`]);
    }
  }
  throw new AiProviderError(failures);
}

/**
 * NVIDIA only, deliberately. DigitalOcean serverless inference hosts
 * `qwen3-embedding-0.6b` rather than a Nemotron embedding model, and a
 * different model is a different vector space: mixing the two in one
 * `vector(768)` column would corrupt every `<=>` comparison without erroring.
 * Chat fails over; embeddings do not.
 */
async function embed(texts: string[], inputType: InputType): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (env.aiMock) {
    return texts.map((text) => deterministicVector(text, EMBED_DIMS));
  }
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    vectors.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE), inputType)));
  }
  return vectors;
}

/** Indexing: extract bodies, note bodies, concept labels. */
export function embedPassages(texts: string[]): Promise<number[][]> {
  return embed(texts, "passage");
}

/** Searching: what the user is looking for right now. */
export async function embedQuery(text: string): Promise<number[]> {
  const [vector] = await embed([text], "query");
  return vector;
}

/**
 * pgvector takes a vector as a bound string parameter, so
 * `where embedding <=> $1::vector` works without string-building SQL.
 */
export function toVectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}
