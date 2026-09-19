/**
 * URLs to markdown with `defuddle` for readability extraction and `linkedom`
 * for a DOM that runs on the server. No AI call, so the token budget stays with
 * the reasoning work.
 */
import { Defuddle } from "defuddle/node";
import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { wordCount } from "@/lib/contracts/markdown";
import { deriveTitle, titleFromUrl } from "./text";

const USER_AGENT =
  "Mozilla/5.0 (compatible; HelloWordBot/0.1; +https://github.com/RecursiveFunctions/HelloWord)";

/** Below this, assume the page was JS-rendered and defuddle under-extracted. */
const THIN_CONTENT_WORDS = 120;

export type UrlExtraction = {
  markdown: string;
  title: string;
  /** False when the page is thin enough that Gemini `url_context` should retry. */
  usable: boolean;
};

export class FetchFailed extends Error {}

export async function fetchPage(
  url: string,
): Promise<{ html: string; contentType: string; finalUrl: string }> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "user-agent": USER_AGENT,
      accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "accept-language": "en-US,en;q=0.9",
    },
  });

  if (!response.ok) {
    throw new FetchFailed(
      `${url} returned ${response.status} ${response.statusText}`,
    );
  }

  return {
    html: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
    finalUrl: response.url || url,
  };
}

export async function extractUrl(
  url: string,
  html: string,
): Promise<UrlExtraction> {
  // linkedom's Document is structurally compatible with what defuddle reads,
  // but the two packages ship independent DOM type declarations.
  const { document } = parseHTML(html);
  const result = await Defuddle(document as unknown as Document, url, {
    url,
    markdown: true,
    separateMarkdown: true,
  });

  const raw = result.contentMarkdown ?? result.content ?? "";
  const markdown = looksLikeHtml(raw) ? htmlToMarkdown(raw) : raw;
  const title =
    result.title?.trim() || deriveTitle(markdown, titleFromUrl(url));

  return {
    markdown,
    title,
    usable: wordCount(markdown) >= THIN_CONTENT_WORDS,
  };
}

function looksLikeHtml(content: string): boolean {
  return /<(p|div|article|section|h[1-6])\b/i.test(content);
}

let turndown: TurndownService | null = null;

function htmlToMarkdown(html: string): string {
  turndown ??= new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  return turndown.turndown(html);
}
