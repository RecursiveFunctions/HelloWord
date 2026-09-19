/**
 * Markdown normalization is part of the frozen contract.
 * Workstream A applies this once at ingest. Everyone else assumes it
 * and must never re-normalize stored markdown, or extract offsets shift.
 */
export function normalizeMarkdown(input: string): string {
  let s = input.normalize("NFC");
  s = s.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  s = s.replace(/\t/g, "  ");
  s = s
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");
  s = s.replace(/\n{3,}/g, "\n\n");
  s = s.replace(/\n*$/g, "\n");
  return s;
}

export function wordCount(markdown: string): number {
  const trimmed = markdown.trim();
  if (!trimmed) return 0;
  return trimmed.split(/\s+/).length;
}
