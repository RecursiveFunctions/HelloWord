import { createHash } from "node:crypto";
import { normalizeMarkdown } from "./contracts/markdown";

/** sha256 of normalized markdown. Server-only; do not import from client components. */
export function hashBody(bodyMd: string): string {
  return createHash("sha256")
    .update(normalizeMarkdown(bodyMd), "utf8")
    .digest("hex");
}
