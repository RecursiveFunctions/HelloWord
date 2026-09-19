import type { SelectorBundle } from "../contracts/anchor";

/**
 * Characters of context stored either side of the quote. The frozen contract
 * caps prefix and suffix at 64, so this must stay at or below that.
 */
export const CONTEXT_LENGTH = 32;

/** `SelectorBundle.exact` has a 10-character floor: shorter quotes match everywhere. */
export const MIN_EXACT_LENGTH = 10;

/** Context shorter than this carries no signal and is not worth matching on. */
export const MIN_CONTEXT_LENGTH = 8;

/**
 * Build a bundle from a character range in the normalized source markdown.
 * Offsets are clamped and ordered, so a backwards or out-of-bounds selection
 * still produces a well-formed bundle.
 */
export function buildSelector(
  markdown: string,
  start: number,
  end: number,
): SelectorBundle {
  const lo = Math.max(0, Math.min(start, end));
  const hi = Math.min(markdown.length, Math.max(start, end, lo));
  return {
    exact: markdown.slice(lo, hi),
    prefix: markdown.slice(Math.max(0, lo - CONTEXT_LENGTH), lo),
    suffix: markdown.slice(hi, hi + CONTEXT_LENGTH),
    start: lo,
    end: hi,
  };
}

/** Whether a range is long enough to survive `SelectorBundle` validation. */
export function isAnchorableRange(start: number, end: number): boolean {
  return Math.abs(end - start) >= MIN_EXACT_LENGTH;
}

/** Every start offset at which `needle` appears in `text`, including overlaps. */
export function occurrences(text: string, needle: string): number[] {
  if (!needle) return [];
  const found: number[] = [];
  for (let i = text.indexOf(needle); i !== -1; i = text.indexOf(needle, i + 1)) {
    found.push(i);
  }
  return found;
}

/** Length of the longest common prefix of two strings. */
export function commonPrefixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[i] === b[i]) i += 1;
  return i;
}

/** Length of the longest common suffix of two strings. */
export function commonSuffixLength(a: string, b: string): number {
  const limit = Math.min(a.length, b.length);
  let i = 0;
  while (i < limit && a[a.length - 1 - i] === b[b.length - 1 - i]) i += 1;
  return i;
}

/**
 * How well the text surrounding a candidate range agrees with the stored
 * context, in characters matched. Used to choose between repeated quotes.
 */
export function contextScore(
  markdown: string,
  start: number,
  end: number,
  stored: Pick<SelectorBundle, "prefix" | "suffix">,
): number {
  const before = markdown.slice(Math.max(0, start - stored.prefix.length), start);
  const after = markdown.slice(end, end + stored.suffix.length);
  return (
    commonSuffixLength(before, stored.prefix) +
    commonPrefixLength(after, stored.suffix)
  );
}

/**
 * Resolve a bare quote to a full bundle. This is the path AI proposals take:
 * the model returns only `exact`, and the client does all the offset work.
 *
 * Returns null when the quote does not appear verbatim, which for a proposal
 * means the model paraphrased and the suggestion must be rejected.
 */
export function resolveExact(
  markdown: string,
  exact: string,
  hint = 0,
): SelectorBundle | null {
  const hits = occurrences(markdown, exact);
  if (hits.length === 0) return null;
  let best = hits[0];
  for (const hit of hits) {
    if (Math.abs(hit - hint) < Math.abs(best - hint)) best = hit;
  }
  return buildSelector(markdown, best, best + exact.length);
}
