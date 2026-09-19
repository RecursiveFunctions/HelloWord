/**
 * Gemini is the eyes, not the brain.
 *
 * It gets exactly two jobs, both of which `unpdf` and `defuddle` cannot do:
 * reading a PDF that has no text layer, and reading a page that renders its
 * content with JavaScript. Every task that reasons or writes belongs to
 * Nemotron, in workstream C.
 *
 * Google Search grounding is deliberately not enabled; it is not on the free
 * tier. `url_context` is.
 */
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";
import { toBase64 } from "@/lib/storage/spaces";

const MODEL = "gemini-3.8-flash";

const TRANSCRIBE_PROMPT = `Transcribe this document to clean Markdown.

Rules:
- Output only the Markdown. No preamble, no commentary, no code fence around the whole document.
- Use # / ## / ### for the document's own heading hierarchy.
- One paragraph per line. Never hard-wrap a paragraph across several lines.
- Render tables as Markdown tables. Describe each figure in italics on its own line, prefixed with "Figure:".
- Drop page numbers, running headers, and footers entirely. Do not write page markers.
- Preserve footnotes where the document has them.`;

const URL_PROMPT = `Read the page at this URL and return its main article as clean Markdown.

Rules:
- Output only the Markdown. No preamble and no commentary.
- Include the article body only: no navigation, ads, cookie banners, comments, or related-post lists.
- One paragraph per line. Never hard-wrap a paragraph across several lines.
- Keep the article's own headings, links, and code blocks.

URL: `;

export function geminiConfigured(): boolean {
  return Boolean(env.gemini.apiKey);
}

let cached: GoogleGenAI | null = null;

function client(): GoogleGenAI {
  if (!env.gemini.apiKey) {
    throw new Error(
      "Gemini is not configured. Set GEMINI_API_KEY in .env.local to enable the scanned-PDF fallback.",
    );
  }
  cached ??= new GoogleGenAI({ apiKey: env.gemini.apiKey });
  return cached;
}

/** Native page vision: 258 tokens per page, structure that text extraction destroys. */
export async function geminiPdfToMarkdown(bytes: Uint8Array): Promise<string> {
  const response = await client().models.generateContent({
    model: MODEL,
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType: "application/pdf",
              data: toBase64(bytes),
            },
          },
          { text: TRANSCRIBE_PROMPT },
        ],
      },
    ],
  });

  return stripFence(response.text ?? "");
}

export async function geminiUrlToMarkdown(url: string): Promise<string> {
  const response = await client().models.generateContent({
    model: MODEL,
    contents: `${URL_PROMPT}${url}`,
    config: { tools: [{ urlContext: {} }] },
  });

  return stripFence(response.text ?? "");
}

/** Models wrap whole-document output in ```markdown about a third of the time. */
function stripFence(text: string): string {
  const fenced = text
    .trim()
    .match(/^```(?:markdown|md)?\n([\s\S]*?)\n```$/);
  return (fenced?.[1] ?? text).trim();
}
