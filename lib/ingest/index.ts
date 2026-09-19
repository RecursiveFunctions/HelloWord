/**
 * The ingest status machine, and the single gate into everything downstream.
 *
 *   pending -> processing -> ready
 *                         -> failed
 *
 * A source reaching `ready` is the only event that makes it extractable, and it
 * cannot reach `ready` without markdown: the schema has a check constraint and
 * `updateSource` asserts the same thing for the memory backend.
 *
 * This module is the only place allowed to touch `storage_key` or fetch
 * `origin_uri`. B, C, and D read `source.markdown` and nothing else.
 */
import { normalizeMarkdown, wordCount } from "@/lib/contracts/markdown";
import { getBytes, spacesConfigured } from "@/lib/storage/spaces";
import { getSource, updateSource } from "@/lib/store/sources";
import type { IngestMethod, SourceRow } from "@/lib/store/types";
import { geminiConfigured, geminiPdfToMarkdown, geminiUrlToMarkdown } from "./gemini";
import { extractPdf } from "./pdf";
import { extractUrl, fetchPage } from "./url";
import { deriveTitle, titleFromUrl } from "./text";

export class IngestError extends Error {}

type Extraction = {
  markdown: string;
  method: IngestMethod;
  title: string | null;
};

/**
 * Run the pipeline for one source and persist the outcome. Never throws: a
 * failure is recorded as `ingest_status = 'failed'` with the reason, because
 * the caller is usually `after()` and has no response left to fail.
 *
 * `bytes` lets the multipart upload path skip a Spaces round trip for a file
 * that is already in memory.
 */
export async function ingestSource(
  id: string,
  bytes?: Uint8Array,
): Promise<SourceRow | null> {
  const source = await getSource(id);
  if (!source) return null;
  if (source.ingest_status === "ready") return source;

  await updateSource(id, { ingest_status: "processing", ingest_error: null });

  try {
    const result =
      source.kind === "pdf"
        ? await ingestPdf(source, bytes)
        : await ingestUrl(source);

    const markdown = normalizeMarkdown(result.markdown);
    if (!markdown.trim()) {
      throw new IngestError(
        "Extraction produced no markdown. A source cannot become ready without it.",
      );
    }

    return await updateSource(id, {
      markdown,
      word_count: wordCount(markdown),
      ingest_method: result.method,
      ingest_status: "ready",
      ingest_error: null,
      title: source.title || result.title || deriveTitle(markdown, source.origin_uri),
    });
  } catch (error) {
    return await updateSource(id, {
      ingest_status: "failed",
      ingest_error: describe(error),
    });
  }
}

async function ingestPdf(
  source: SourceRow,
  provided?: Uint8Array,
): Promise<Extraction> {
  const bytes = provided ?? (await loadPdfBytes(source));

  const local = await extractPdf(bytes, titleFromUrl(source.origin_uri));
  if (local.usable) {
    return { markdown: local.markdown, method: "unpdf", title: local.title };
  }

  // No text layer, or so little text that the PDF is scanned or all figures.
  if (!geminiConfigured()) {
    throw new IngestError(
      `No text layer in this PDF (${local.pages} pages) and GEMINI_API_KEY is not set, so the page-vision fallback is unavailable.`,
    );
  }

  const markdown = await geminiPdfToMarkdown(bytes);
  return {
    markdown,
    method: "gemini_vision",
    title: local.title ?? deriveTitle(markdown, titleFromUrl(source.origin_uri)),
  };
}

async function loadPdfBytes(source: SourceRow): Promise<Uint8Array> {
  if (source.storage_key) {
    if (!spacesConfigured()) {
      throw new IngestError(
        `Source ${source.id} has a Spaces key but Spaces is not configured. Set SPACES_KEY, SPACES_SECRET, and SPACES_BUCKET.`,
      );
    }
    return getBytes(source.storage_key);
  }

  if (/^https?:/i.test(source.origin_uri)) {
    const response = await fetch(source.origin_uri, { redirect: "follow" });
    if (!response.ok) {
      throw new IngestError(
        `${source.origin_uri} returned ${response.status} ${response.statusText}`,
      );
    }
    return new Uint8Array(await response.arrayBuffer());
  }

  throw new IngestError(
    `Source ${source.id} has no storage key and no fetchable origin URI.`,
  );
}

async function ingestUrl(source: SourceRow): Promise<Extraction> {
  const { html, contentType } = await fetchPage(source.origin_uri);

  // A "URL" that serves a PDF is a PDF. Re-enter the other branch rather than
  // handing HTML-shaped bytes to defuddle.
  if (contentType.includes("application/pdf")) {
    return ingestPdf({ ...source, kind: "pdf" });
  }

  const local = await extractUrl(source.origin_uri, html);
  if (local.usable) {
    return { markdown: local.markdown, method: "defuddle", title: local.title };
  }

  // Thin extraction usually means the page rendered its body with JavaScript.
  if (!geminiConfigured()) {
    if (local.markdown.trim()) {
      return {
        markdown: local.markdown,
        method: "defuddle",
        title: local.title,
      };
    }
    throw new IngestError(
      `Nothing extractable at ${source.origin_uri} and GEMINI_API_KEY is not set, so the url_context fallback is unavailable.`,
    );
  }

  const markdown = await geminiUrlToMarkdown(source.origin_uri);
  if (!markdown.trim()) {
    return { markdown: local.markdown, method: "defuddle", title: local.title };
  }
  return {
    markdown,
    method: "gemini_url",
    title: local.title || deriveTitle(markdown, titleFromUrl(source.origin_uri)),
  };
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

export { titleFromUrl };
