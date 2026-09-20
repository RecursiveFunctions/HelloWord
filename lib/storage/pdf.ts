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
  /**
   * Null when no durable store was available, so the original was not kept.
   * The source is still ingested: markdown is what extracts and notes read,
   * and the reader already handles a PDF whose original is missing.
   */
  storage_key: string | null;
  origin_uri: string;
  /** Why the original was not archived. Set only alongside a null key. */
  unarchived?: string;
};

function requiresDurableStorage(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true";
}

const NO_DURABLE_STORE =
  "Serverless filesystems do not survive the request, and Spaces is not configured. Set SPACES_KEY, SPACES_SECRET, and SPACES_BUCKET to keep original PDFs.";

/**
 * Archive the original if there is anywhere durable to put it.
 *
 * Never throws. Losing the archive must not lose the upload: extraction runs
 * from the bytes already in memory, so a source with no `storage_key` still
 * becomes a readable, extractable source. It only loses the "open original
 * PDF" affordance, which the reader already words for that case.
 */
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
      console.error("Spaces upload failed", error);
      if (requiresDurableStorage()) {
        return skipped(key, `The Spaces upload failed: ${describe(error)}`);
      }
      console.error("Storing the PDF on disk instead");
    }
  }

  if (requiresDurableStorage()) return skipped(key, NO_DURABLE_STORE);

  const localKey = `local:${key}`;
  try {
    await writeLocalPdf(localKey, bytes);
  } catch (error) {
    console.error("Could not write the PDF to data/pdfs", error);
    return skipped(key, `Could not write to data/pdfs: ${describe(error)}`);
  }
  return { storage_key: localKey, origin_uri: `upload://${key}` };
}

function skipped(key: string, reason: string): StoredPdf {
  return { storage_key: null, origin_uri: `upload://${key}`, unarchived: reason };
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
