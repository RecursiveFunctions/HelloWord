import { after } from "next/server";
import { CreateSourceBody } from "@/lib/api";
import { ingestSource } from "@/lib/ingest";
import { titleFromUrl } from "@/lib/ingest/text";
import { pdfKey, putPdf, spacesConfigured, spacesUri } from "@/lib/storage/spaces";
import { createSource, findSourceByUri, listSources } from "@/lib/store/sources";
import type { SourceRow } from "@/lib/store/types";
import { fail, invalid, ok, readJson } from "../_respond";

/** Ingest can take the better part of a minute on a scanned PDF. */
export const maxDuration = 60;

export async function GET(): Promise<Response> {
  return ok({ sources: await listSources() });
}

/**
 * Two request shapes, one route:
 *
 * - `application/json` matching `CreateSourceBody`, for a pasted URL or a PDF
 *   the browser already uploaded with a presigned PUT.
 * - `multipart/form-data` with a `file` field, for a PDF small enough to pass
 *   through a serverless function.
 *
 * Either way the response is 202 and a `pending` row. Extraction runs in
 * `after()` and the client polls `GET /api/sources/:id`.
 */
export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get("content-type") ?? "";

  return contentType.includes("multipart/form-data")
    ? handleUpload(request)
    : handleJson(request);
}

async function handleJson(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (body === null) return fail("Expected a JSON body.");

  // The contract requires a title; pasting a URL should not. Derive one first,
  // then validate, so the frozen shape still describes what reaches the store.
  const withTitle =
    typeof body === "object" && body !== null
      ? {
          ...body,
          title:
            (body as { title?: unknown }).title ||
            titleFromUrl(String((body as { origin_uri?: unknown }).origin_uri ?? "")),
        }
      : body;

  const parsed = CreateSourceBody.safeParse(withTitle);
  if (!parsed.success) return invalid(parsed.error);

  const { kind, title, origin_uri, storage_key } = parsed.data;

  if (kind === "url" && !/^https?:\/\//i.test(origin_uri)) {
    return fail("A url source needs an http or https origin_uri.");
  }

  // Re-posting a URL that failed is how you retry it; re-posting one that is
  // ready hands back the existing row rather than ingesting it twice.
  const existing = await findSourceByUri(origin_uri);
  if (existing) return resume(existing);

  const source = await createSource({ kind, title, origin_uri, storage_key });
  after(() => ingestSource(source.id));
  return ok({ source }, 202);
}

async function handleUpload(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Could not read the multipart body.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail("Expected a `file` field holding a PDF.");
  }
  if (file.size === 0) return fail("That file is empty.");

  const isPdf =
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) {
    return fail(
      "Only PDFs can be uploaded. Paste a URL for anything else — every source becomes markdown either way.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const title =
    String(form.get("title") ?? "").trim() ||
    file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");

  // Spaces keeps the original so a side-by-side viewer stays possible later.
  // It is archival: extraction below reads the bytes we already have.
  let storageKey: string | null = null;
  if (spacesConfigured()) {
    try {
      const key = pdfKey(file.name);
      await putPdf(key, bytes);
      storageKey = key;
    } catch (error) {
      console.error("Spaces upload failed; ingesting from memory instead", error);
    }
  }

  const source = await createSource({
    kind: "pdf",
    title,
    origin_uri: storageKey ? spacesUri(storageKey) : `upload://${file.name}`,
    storage_key: storageKey,
  });

  after(() => ingestSource(source.id, bytes));
  return ok({ source }, 202);
}

function resume(existing: SourceRow): Response {
  if (existing.ingest_status === "failed") {
    after(() => ingestSource(existing.id));
    return ok({ source: { ...existing, ingest_status: "pending" }, retried: true }, 202);
  }
  return ok({ source: existing, existing: true }, 200);
}
