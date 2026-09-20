/**
 * On-disk PDF archive for `npm run dev` when Spaces is not configured.
 *
 * Keys are `local:sources/{uuid}/{safe-name}.pdf`. The prefix is stripped and
 * the rest is resolved under `data/pdfs/`, with `..` and absolute segments
 * rejected so a stored key cannot escape that directory.
 */
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

export const LOCAL_PDF_PREFIX = "local:";

const ROOT = path.resolve(process.cwd(), "data", "pdfs");

export function isLocalPdfKey(key: string): boolean {
  return key.startsWith(LOCAL_PDF_PREFIX);
}

export function localPdfPath(key: string): string {
  if (!isLocalPdfKey(key)) {
    throw new Error(`Not a local PDF key: ${key}`);
  }
  const relative = key.slice(LOCAL_PDF_PREFIX.length).replace(/\\/g, "/");
  if (!relative || relative.startsWith("/") || relative.includes("..")) {
    throw new Error("Invalid local PDF key.");
  }
  if (!/^[a-zA-Z0-9._/-]+$/.test(relative)) {
    throw new Error("Invalid local PDF key.");
  }
  const resolved = path.resolve(ROOT, relative);
  const rootWithSep = ROOT.endsWith(path.sep) ? ROOT : ROOT + path.sep;
  if (resolved !== ROOT && !resolved.startsWith(rootWithSep)) {
    throw new Error("Invalid local PDF key.");
  }
  return resolved;
}

export async function writeLocalPdf(
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const file = localPdfPath(key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export async function readLocalPdf(key: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(localPdfPath(key)));
}

export async function localPdfExists(key: string): Promise<boolean> {
  try {
    await access(localPdfPath(key));
    return true;
  } catch {
    return false;
  }
}
