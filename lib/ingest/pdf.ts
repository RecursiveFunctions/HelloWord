/**
 * Text-layer PDFs, locally and for free. `unpdf` ships a serverless build of
 * PDF.js, so this runs on Vercel without a system dependency.
 *
 * There is no pdf.js text layer anywhere in the browser half of this app. The
 * page map that `extractText` gives us is deliberately thrown away: page breaks
 * must not become markers in the markdown, or every stored extract offset moves.
 */
import { extractText, getDocumentProxy, getMeta } from "unpdf";
import { deriveTitle, hasUsableText, reflowExtractedText } from "./text";

export type PdfExtraction = {
  markdown: string;
  title: string | null;
  pages: number;
  /** False when the PDF is scanned or figure-heavy and Gemini should take it. */
  usable: boolean;
};

export async function extractPdf(
  bytes: Uint8Array,
  fallbackTitle: string,
): Promise<PdfExtraction> {
  const pdf = await getDocumentProxy(bytes);
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [text];

  const joined = pages.join("\n");
  const usable = hasUsableText(joined, totalPages);
  const markdown = usable ? reflowExtractedText(pages) : "";

  // A paper's real title is rarely its first heading — that is usually
  // "Abstract" — so the PDF's own metadata wins when it has any.
  const embedded = await pdfTitle(pdf);

  return {
    markdown,
    title: embedded ?? (usable ? deriveTitle(markdown, fallbackTitle) : null),
    pages: totalPages,
    usable,
  };
}

async function pdfTitle(pdf: unknown): Promise<string | null> {
  try {
    const { info } = await getMeta(pdf as Parameters<typeof getMeta>[0]);
    const title = info?.Title;
    return typeof title === "string" && title.trim() ? title.trim() : null;
  } catch {
    return null;
  }
}
