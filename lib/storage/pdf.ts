/**
 * Persist and retrieve the original PDF.
 *
 * Ingest still owns extraction. The reader file route is the other caller:
 * it streams the archived bytes so `/read/[id]` can show real pages. Markdown
 * remains the input for extracts and notes; this helper is only the archive.
 *
 * Spaces wins when configured. Local development can fall back to
 * `data/pdfs/`, but Vercel must use durable object storage because its
 * function filesystem is ephemeral.
 */
import {
  isLocalPdfKey,
  localPdfExists,
  readLocalPdf,
  writeLocalPdf,
} from "./local";
import {
  getBytes,
  objectExists,
  pdfKey,
  putPdf,
  spacesConfigured,
  spacesUri,
} from "./spaces";

export type StoredPdf = {
  storage_key: string;
  origin_uri: string;
};

function requiresDurableStorage(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

function durableStorageError(cause?: unknown): Error {
  const error = new Error(
    "PDF uploads on Vercel require DigitalOcean Spaces. Configure the DO_SPACES_* environment variables and redeploy.",
  );
  if (cause !== undefined) error.cause = cause;
  return error;
}

export async function persistPdf(
  filename: string,
  bytes: Uint8Array,
): Promise<StoredPdf> {
  const key = pdfKey(filename);
  if (spacesConfigured()) {
    try {
      await putPdf(key, bytes);
      return { storage_key: key, origin_uri: spacesUri(key) };
    } catch (error) {
      if (requiresDurableStorage()) throw durableStorageError(error);
      console.error("Spaces upload failed; storing PDF on disk instead", error);
    }
  }

  if (requiresDurableStorage()) throw durableStorageError();

  const localKey = `local:${key}`;
  await writeLocalPdf(localKey, bytes);
  return { storage_key: localKey, origin_uri: `upload://${key}` };
}

export async function readStoredPdf(key: string): Promise<Uint8Array> {
  if (isLocalPdfKey(key)) return readLocalPdf(key);
  return getBytes(key);
}

export async function storedPdfExists(
  key: string | null | undefined,
): Promise<boolean> {
  if (!key) return false;
  if (isLocalPdfKey(key)) return localPdfExists(key);
  if (!spacesConfigured()) return false;
  return objectExists(key);
}
