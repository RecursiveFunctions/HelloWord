import { z } from "zod";
import { presignUpload, spacesConfigured, spacesUri } from "@/lib/storage/spaces";
import { fail, invalid, ok, readJson } from "../../_respond";

const PresignBody = z.object({
  filename: z.string().min(1).max(200),
});

/**
 * Presigned PUT straight to Spaces, for PDFs above Vercel's 4.5 MB request-body
 * cap. The browser PUTs the file, then posts the returned `storage_key` and
 * `origin_uri` to `POST /api/sources` as an ordinary JSON create.
 *
 * Needs a CORS rule on the bucket allowing PUT from the app origin. Without one
 * the Library falls back to the multipart path automatically.
 */
export async function POST(request: Request): Promise<Response> {
  if (!spacesConfigured()) {
    return fail(
      "Files over 4 MB need DigitalOcean Spaces. Set SPACES_KEY, SPACES_SECRET, and SPACES_BUCKET, or upload a smaller PDF.",
      503,
    );
  }

  const parsed = PresignBody.safeParse(await readJson(request));
  if (!parsed.success) return invalid(parsed.error);

  const { key, url, expiresIn } = await presignUpload(parsed.data.filename);
  return ok({ key, url, expiresIn, origin_uri: spacesUri(key) });
}
