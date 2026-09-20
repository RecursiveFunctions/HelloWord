/**
 * DigitalOcean Spaces, which is S3-compatible, so the AWS SDK works unchanged
 * once the endpoint and region are pointed at it.
 *
 * Spaces holds the original PDF. Ingest reads it to extract markdown. The
 * reader file route is the other allowed caller: it streams the same object
 * so `/read/[id]` can show the original pages. Extracts and notes still read
 * `source.markdown` only.
 */
import { Buffer } from "node:buffer";
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "@/lib/env";

export function spacesConfigured(): boolean {
  return Boolean(env.spaces.key && env.spaces.secret && env.spaces.bucket);
}

/** `https://nyc3.digitaloceanspaces.com` -> `nyc3`. */
function regionFromEndpoint(endpoint: string): string {
  try {
    const host = new URL(endpoint).hostname;
    const [first] = host.split(".");
    return first || "us-east-1";
  } catch {
    return "us-east-1";
  }
}

let cached: S3Client | null = null;

function client(): S3Client {
  if (!spacesConfigured()) {
    throw new Error(
      "Spaces is not configured. Set SPACES_KEY, SPACES_SECRET, and SPACES_BUCKET in .env.local.",
    );
  }
  cached ??= new S3Client({
    region: regionFromEndpoint(env.spaces.endpoint),
    endpoint: env.spaces.endpoint,
    forcePathStyle: false,
    credentials: {
      accessKeyId: env.spaces.key!,
      secretAccessKey: env.spaces.secret!,
    },
  });
  return cached;
}

function safeName(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "upload.pdf";
  return base.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 80) || "upload.pdf";
}

export function pdfKey(filename: string): string {
  return `sources/${crypto.randomUUID()}/${safeName(filename)}`;
}

/** The `origin_uri` we record for an uploaded PDF, matching the seed's format. */
export function spacesUri(key: string): string {
  return `spaces://${env.spaces.bucket}/${key}`;
}

export async function putPdf(key: string, bytes: Uint8Array): Promise<void> {
  await client().send(
    new PutObjectCommand({
      Bucket: env.spaces.bucket!,
      Key: key,
      Body: bytes,
      ContentType: "application/pdf",
      ACL: "private",
    }),
  );
}

export async function getBytes(key: string): Promise<Uint8Array> {
  const result = await client().send(
    new GetObjectCommand({ Bucket: env.spaces.bucket!, Key: key }),
  );
  if (!result.Body) throw new Error(`Spaces object ${key} has no body.`);
  return new Uint8Array(await result.Body.transformToByteArray());
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(
      new HeadObjectCommand({ Bucket: env.spaces.bucket!, Key: key }),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Presigned PUT so the browser uploads straight to Spaces. Vercel caps a
 * serverless request body at 4.5 MB, which a real paper clears easily, so the
 * direct multipart path on `POST /api/sources` is only for small files.
 * Requires a CORS rule on the bucket allowing PUT from the app origin.
 */
export async function presignUpload(
  filename: string,
  expiresIn = 900,
): Promise<{ key: string; url: string; expiresIn: number }> {
  const key = pdfKey(filename);
  const url = await getSignedUrl(
    client(),
    new PutObjectCommand({
      Bucket: env.spaces.bucket!,
      Key: key,
      ContentType: "application/pdf",
    }),
    { expiresIn },
  );
  return { key, url, expiresIn };
}

export function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
