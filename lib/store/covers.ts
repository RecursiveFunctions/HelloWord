/**
 * Optional stored screenshot bytes. Card faces ignore this and render live
 * `ImageResponse` previews from current notes and sources instead.
 *
 * Uploads still land in this process-local map (same `globalThis` trick as the
 * memory store) and, when Spaces is configured, also in the bucket under
 * `notebooks/{id}/`.
 */
import {
  getBytes,
  putBytes,
  spacesConfigured,
} from "@/lib/storage/spaces";

export const MAX_COVER_BYTES = 2 * 1024 * 1024;

export const COVER_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/svg+xml",
] as const;

export type CoverMime = (typeof COVER_MIME_TYPES)[number];

export const MEMORY_COVER_PREFIX = "memory:";

export type CoverBlob = {
  mime: CoverMime;
  bytes: Uint8Array;
};

const holder = globalThis as unknown as {
  __helloword_covers?: Map<string, CoverBlob>;
};

function blobs(): Map<string, CoverBlob> {
  holder.__helloword_covers ??= new Map();
  return holder.__helloword_covers;
}

export function memoryCoverKey(notebookId: string): string {
  return `${MEMORY_COVER_PREFIX}${notebookId}`;
}

export function isMemoryCoverKey(key: string): boolean {
  return key.startsWith(MEMORY_COVER_PREFIX);
}

export function isPublicCoverPath(key: string): boolean {
  return key.startsWith("/") && !key.startsWith("//") && !key.includes("://");
}

export function isCoverMime(value: string): value is CoverMime {
  return (COVER_MIME_TYPES as readonly string[]).includes(value);
}

export function mimeFromUpload(file: File): CoverMime | null {
  if (isCoverMime(file.type)) return file.type;
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".svg")) return "image/svg+xml";
  return null;
}

export function coverExtension(mime: CoverMime): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/svg+xml":
      return "svg";
  }
}

export function notebookCoverKey(notebookId: string, mime: CoverMime): string {
  return `notebooks/${notebookId}/cover.${coverExtension(mime)}`;
}

export function getCoverBlob(notebookId: string): CoverBlob | null {
  return blobs().get(notebookId) ?? null;
}

export function putCoverBlob(notebookId: string, blob: CoverBlob): void {
  blobs().set(notebookId, blob);
}

export function deleteCoverBlob(notebookId: string): void {
  blobs().delete(notebookId);
}

export function resetCoverBlobs(): void {
  blobs().clear();
}

/**
 * Persist an uploaded screenshot. Always kept in memory so `npm run dev`
 * without Spaces still shows the card. Spaces is best-effort archival.
 */
export async function storeNotebookCover(
  notebookId: string,
  blob: CoverBlob,
): Promise<string> {
  putCoverBlob(notebookId, blob);

  if (spacesConfigured()) {
    try {
      const key = notebookCoverKey(notebookId, blob.mime);
      await putBytes(key, blob.bytes, blob.mime);
      return key;
    } catch (error) {
      console.error(
        "Spaces cover upload failed; keeping the screenshot in memory",
        error,
      );
    }
  }

  return memoryCoverKey(notebookId);
}

export async function loadStoredCover(
  notebookId: string,
  key: string,
): Promise<CoverBlob | null> {
  const memory = getCoverBlob(notebookId);
  if (memory && (isMemoryCoverKey(key) || key === notebookCoverKey(notebookId, memory.mime))) {
    return memory;
  }
  if (memory && isMemoryCoverKey(key)) return memory;

  if (spacesConfigured() && !isPublicCoverPath(key) && !isMemoryCoverKey(key)) {
    try {
      const bytes = await getBytes(key);
      const mime = mimeFromKey(key);
      if (mime) return { mime, bytes };
    } catch (error) {
      console.error("Spaces cover read failed", error);
    }
  }

  return memory;
}

function mimeFromKey(key: string): CoverMime | null {
  const lower = key.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".svg")) return "image/svg+xml";
  return "image/png";
}

