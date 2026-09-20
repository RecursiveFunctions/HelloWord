/**
 * Persist and retrieve the original PDF.
 *
 * Ingest still owns extraction. The reader file route is the other caller:
 * it streams the archived bytes so `/read/[id]` can show real pages. Markdown
 * remains the input for extracts and notes; this helper is only the archive.
 *
 * Spaces wins when configured. Otherwise the file lands under `data/pdfs/`.
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
      console.error("Spaces upload failed; storing PDF on disk instead", error);
    }
  }

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
