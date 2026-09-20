/**
 * Browser-side helpers for adding things to the library, optionally linking
 * them into a notebook in the same request. Shared by the Library's add panel
 * and the notebook Add menu / drag-drop.
 */

/** Vercel caps a serverless request body at 4.5 MB; presign anything near it. */
const DIRECT_UPLOAD_LIMIT = 4 * 1024 * 1024;

export const SUPPORTED_LABEL = "PDF, Markdown (.md), or text (.txt)";
export const FILE_ACCEPT =
  "application/pdf,.pdf,text/markdown,.md,.markdown,text/plain,.txt";

export function isPdf(file: File): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name);
}

export function isTextFile(file: File): boolean {
  return /\.(md|markdown|txt)$/i.test(file.name);
}

export function isSupportedFile(file: File): boolean {
  return isPdf(file) || isTextFile(file);
}

export type UploadResult =
  | { ok: true; kind: "source" | "note" }
  | { ok: false; error: string };

async function toResult(
  response: Response,
  fallback: string,
): Promise<UploadResult> {
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    return { ok: false, error: body.error ?? `${fallback} (${response.status}).` };
  }
  const body = await response.json().catch(() => ({}));
  return { ok: true, kind: body.note ? "note" : "source" };
}

export async function uploadFile(
  file: File,
  opts: { notebookId?: string } = {},
): Promise<UploadResult> {
  if (!isSupportedFile(file)) {
    return { ok: false, error: `${file.name}: only ${SUPPORTED_LABEL} files are supported.` };
  }

  try {
    const response =
      isPdf(file) && file.size > DIRECT_UPLOAD_LIMIT
        ? await uploadViaPresign(file, opts.notebookId)
        : await uploadDirect(file, opts.notebookId);
    return await toResult(response, "Upload failed");
  } catch (cause) {
    return { ok: false, error: cause instanceof Error ? cause.message : "Upload failed." };
  }
}

export async function addUrl(
  url: string,
  opts: { notebookId?: string } = {},
): Promise<UploadResult> {
  const response = await fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "url",
      origin_uri: url.trim(),
      notebook_id: opts.notebookId,
    }),
  });
  return toResult(response, "Could not add that URL");
}

export async function createNote(
  opts: { notebookId?: string; title?: string } = {},
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const response = await fetch("/api/notes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: opts.title, notebook_id: opts.notebookId }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: body.error ?? `Could not create a note (${response.status}).` };
  }
  return { ok: true, id: body.note.id };
}

export async function linkToNotebook(
  notebookId: string,
  items: { item_type: string; item_id: string }[],
): Promise<{ ok: true; added: number } | { ok: false; error: string }> {
  const response = await fetch(`/api/notebooks/${notebookId}/items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: body.error ?? "Could not add those items." };
  }
  return { ok: true, added: body.added.length };
}

function uploadDirect(file: File, notebookId?: string): Promise<Response> {
  const form = new FormData();
  form.set("file", file);
  if (notebookId) form.set("notebook_id", notebookId);
  return fetch("/api/sources", { method: "POST", body: form });
}

/**
 * Large PDFs go straight to Spaces and only the key comes back through the API.
 * If the bucket has no CORS rule the PUT fails, so fall back to the direct path
 * and let the platform limit be the thing that complains.
 */
async function uploadViaPresign(file: File, notebookId?: string): Promise<Response> {
  const presigned = await fetch("/api/sources/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name }),
  });

  // 503 means Spaces is unset. Falling back to multipart would hit the
  // 4.5 MB platform cap, so surface the presign error instead.
  if (!presigned.ok) {
    if (presigned.status === 503) return presigned;
    return directFallback(file, notebookId);
  }

  const { key, url, origin_uri } = await presigned.json();

  try {
    const put = await fetch(url, {
      method: "PUT",
      body: file,
      headers: { "content-type": "application/pdf" },
    });
    if (!put.ok) return directFallback(file, notebookId);
  } catch {
    return directFallback(file, notebookId);
  }

  return fetch("/api/sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      kind: "pdf",
      title: file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " "),
      origin_uri,
      storage_key: key,
      notebook_id: notebookId,
    }),
  });
}

/**
 * The upload straight to Spaces did not happen, so the bytes have to go
 * through the API after all. A host that caps request bodies rejects a file
 * this size before the route runs, and that rejection is not JSON, so name the
 * real problem rather than letting a bare 413 reach the user.
 */
async function directFallback(
  file: File,
  notebookId?: string,
): Promise<Response> {
  const response = await uploadDirect(file, notebookId);
  if (response.status !== 413) return response;
  return new Response(
    JSON.stringify({
      error: `${file.name} is too large to send through the API. Configure SPACES_KEY, SPACES_SECRET, and SPACES_BUCKET, and allow PUT from this origin on the bucket.`,
    }),
    { status: 413, headers: { "content-type": "application/json" } },
  );
}
