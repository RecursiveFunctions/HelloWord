import { after } from "next/server";
import { CreateSourceBody } from "@/lib/api";
import { distillExtracts } from "@/lib/distill/pipeline";
import { ingestSource } from "@/lib/ingest";
import { titleFromUrl } from "@/lib/ingest/text";
import { persistPdf } from "@/lib/storage/pdf";
import { addNotebookItems, getNotebook } from "@/lib/store/notebooks";
import { createNote } from "@/lib/store/notes";
import { createSource, findSourceByUri, listSources } from "@/lib/store/sources";
import type { SourceRow } from "@/lib/store/types";
import { fail, invalid, notFound, ok, readJson } from "../_respond";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Text uploads become notes; anything larger is almost certainly not a note. */
const MAX_NOTE_BYTES = 1_000_000;

/**
 * `notebook_id` is optional on every create path: when present the new row is
 * linked into that notebook, so adding from a notebook lands in the Library and
 * the notebook in one request. Returns a 404 response for an unknown notebook.
 */
async function notebookTarget(raw: unknown): Promise<string | null | Response> {
  if (raw === undefined || raw === null || raw === "") return null;
  if (typeof raw !== "string" || !UUID.test(raw)) {
    return fail("notebook_id must be a uuid.", 422);
  }
  if (!(await getNotebook(raw))) return notFound("Notebook");
  return raw;
}

/** Ingest can take the better part of a minute on a scanned PDF. */
export const maxDuration = 60;

/**
 * Ingest, then have the model propose extracts, so a new source shows up in the
 * reading queue without anyone pressing Suggest.
 *
 * Both share this route's `maxDuration`. A slow ingest can leave the model call
 * no time to finish; the source is then left `extracting` or `none`, and
 * `POST /api/distill/source/:id` picks it up when the reader next opens it.
 */
async function ingestThenDistill(id: string, bytes?: Uint8Array): Promise<void> {
  const source = await ingestSource(id, bytes);
  if (source?.ingest_status === "ready") await distillExtracts(source.id);
}

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

  const notebookId = await notebookTarget(
    (body as { notebook_id?: unknown }).notebook_id,
  );
  if (notebookId instanceof Response) return notebookId;

  const { kind, title, origin_uri, storage_key } = parsed.data;

  if (kind === "url" && !/^https?:\/\//i.test(origin_uri)) {
    return fail("A url source needs an http or https origin_uri.");
  }

  // Re-posting a URL that failed is how you retry it; re-posting one that is
  // ready hands back the existing row rather than ingesting it twice.
  const existing = await findSourceByUri(origin_uri);
  if (existing) {
    await linkToNotebook(notebookId, "source", existing.id);
    return resume(existing);
  }

  const source = await createSource({ kind, title, origin_uri, storage_key });
  await linkToNotebook(notebookId, "source", source.id);
  after(() => ingestThenDistill(source.id));
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
    return fail("Expected a `file` field holding a PDF, .md, or .txt file.");
  }
  if (file.size === 0) return fail("That file is empty.");

  const notebookId = await notebookTarget(form.get("notebook_id") ?? undefined);
  if (notebookId instanceof Response) return notebookId;

  const lowerName = file.name.toLowerCase();
  const isText =
    /\.(md|markdown|txt)$/.test(lowerName) ||
    file.type === "text/markdown" ||
    file.type === "text/plain";
  if (isText) return handleTextUpload(file, form, notebookId);

  const isPdf = file.type === "application/pdf" || lowerName.endsWith(".pdf");
  if (!isPdf) {
    return fail(
      "Supported files are PDF, Markdown (.md), and text (.txt). Paste a URL for anything else.",
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const title =
    String(form.get("title") ?? "").trim() ||
    file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");

  let stored;
  try {
    stored = await persistPdf(file.name, bytes);
  } catch (error) {
    console.error("Could not archive the uploaded PDF", error);
    return fail("Could not store that PDF.");
  }

  const source = await createSource({
    kind: "pdf",
    title,
    origin_uri: stored.origin_uri,
    storage_key: stored.storage_key,
  });

  await linkToNotebook(notebookId, "source", source.id);
  after(() => ingestThenDistill(source.id, bytes));
  return ok({ source }, 202);
}

async function handleTextUpload(
  file: File,
  form: FormData,
  notebookId: string | null,
): Promise<Response> {
  if (file.size > MAX_NOTE_BYTES) {
    return fail("Text files over 1 MB are too large to import as a note.", 413);
  }

  const text = await file.text();
  const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
  const title =
    String(form.get("title") ?? "").trim() ||
    heading ||
    file.name.replace(/\.(md|markdown|txt)$/i, "").replace(/[-_]+/g, " ");

  const note = await createNote({ title, body_md: text });
  await linkToNotebook(notebookId, "note", note.id);
  return ok({ note }, 201);
}

async function linkToNotebook(
  notebookId: string | null,
  itemType: "source" | "note",
  itemId: string,
): Promise<void> {
  if (!notebookId) return;
  await addNotebookItems(notebookId, [{ item_type: itemType, item_id: itemId }]);
}

function resume(existing: SourceRow): Response {
  if (existing.ingest_status === "failed") {
    after(() => ingestThenDistill(existing.id));
    return ok({ source: { ...existing, ingest_status: "pending" }, retried: true }, 202);
  }
  return ok({ source: existing, existing: true }, 200);
}
