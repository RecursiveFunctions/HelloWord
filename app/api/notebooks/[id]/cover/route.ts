import {
  deleteCoverBlob,
  MAX_COVER_BYTES,
  mimeFromUpload,
  storeNotebookCover,
} from "@/lib/store/covers";
import { liveNotebookCover } from "@/lib/store/previews";
import { getNotebook, updateNotebook } from "@/lib/store/notebooks";
import { fail, notFound, ok } from "../../../_respond";

export const dynamic = "force-dynamic";

/**
 * Always a live paper preview of the oldest note, else the first ready source.
 * Uploaded stills and public SVG paths are ignored so the card cannot go stale.
 * An empty notebook 404s so the UI can show a dashed placeholder.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/notebooks/[id]/cover">,
): Promise<Response> {
  const { id } = await context.params;
  const notebook = await getNotebook(id);
  if (!notebook) return notFound("Notebook");

  const image = await liveNotebookCover({
    notebookId: id,
    color: notebook.color ?? "#c2410c",
  });
  if (!image) return notFound("Notebook cover");
  return image;
}

export async function POST(
  request: Request,
  context: RouteContext<"/api/notebooks/[id]/cover">,
): Promise<Response> {
  const { id } = await context.params;
  if (!(await getNotebook(id))) return notFound("Notebook");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fail("Could not read the multipart body.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return fail("Expected a `file` field holding an image.");
  }
  if (file.size === 0) return fail("That file is empty.");
  if (file.size > MAX_COVER_BYTES) {
    return fail("Screenshots must be 2 MB or smaller.");
  }

  const mime = mimeFromUpload(file);
  if (!mime) {
    return fail("Use a PNG, JPEG, WebP, or SVG screenshot.");
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const cover_storage_key = await storeNotebookCover(id, { mime, bytes });
  const notebook = await updateNotebook(id, { cover_storage_key });
  if (!notebook) return notFound("Notebook");
  return ok({ notebook });
}

export async function DELETE(
  _request: Request,
  context: RouteContext<"/api/notebooks/[id]/cover">,
): Promise<Response> {
  const { id } = await context.params;
  if (!(await getNotebook(id))) return notFound("Notebook");

  deleteCoverBlob(id);
  const notebook = await updateNotebook(id, { cover_storage_key: null });
  if (!notebook) return notFound("Notebook");
  return ok({ notebook });
}
