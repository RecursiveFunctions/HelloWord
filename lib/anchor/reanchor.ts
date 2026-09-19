import search from "approx-string-match";
import type { AnchorStatus, SelectorBundle } from "../contracts/anchor";
import {
  MIN_CONTEXT_LENGTH,
  buildSelector,
  contextScore,
  occurrences,
} from "./selector";

export type ReanchorStrategy = "offset" | "quote" | "context" | "fuzzy" | "none";

export type ReanchorResult = {
  /**
   * Only ever `anchored` or `orphaned`. `detached` means the user deliberately
   * kept the text without a location, so it is set by the caller and the
   * ladder is never run against it.
   */
  status: AnchorStatus;
  strategy: ReanchorStrategy;
  /** 0..1. Verbatim matches score 1; fuzzy matches score by edit distance. */
  confidence: number;
  selector: SelectorBundle;
};

/** Edit budget for the fuzzy rung, as a fraction of the quote's length. */
export const FUZZY_ERROR_RATE = 0.25;

/** Below this, a fuzzy hit is more likely a different passage than a drifted one. */
export const FUZZY_MIN_CONFIDENCE = 0.7;

/**
 * The context rung is gated by its length tolerance rather than by score, so
 * this floor only rejects matches that are both one-flanked and badly sized.
 */
export const CONTEXT_MIN_CONFIDENCE = 0.6;

/** A drifted quote is usually near where it was, so search locally first. */
const FUZZY_WINDOW_PADDING = 2_000;

/** Guard against pathological prefix/suffix pairings in repetitive documents. */
const MAX_CONTEXT_CANDIDATES = 20;

function orphan(stored: SelectorBundle): ReanchorResult {
  return { status: "orphaned", strategy: "none", confidence: 0, selector: stored };
}

function nearestTo(values: number[], target: number, limit: number): number[] {
  if (values.length <= limit) return values;
  return [...values]
    .sort((a, b) => Math.abs(a - target) - Math.abs(b - target))
    .slice(0, limit);
}

/**
 * Rung 3: the quote itself changed, but the text around it did not. Locate the
 * span between a surviving prefix and suffix and treat whatever sits there now
 * as the new quote.
 */
function matchByContext(
  markdown: string,
  stored: SelectorBundle,
): ReanchorResult | null {
  const hasPrefix = stored.prefix.length >= MIN_CONTEXT_LENGTH;
  const hasSuffix = stored.suffix.length >= MIN_CONTEXT_LENGTH;
  if (!hasPrefix && !hasSuffix) return null;

  const expected = stored.exact.length;
  const tolerance = Math.max(16, Math.round(expected * 0.5));

  const starts = hasPrefix
    ? nearestTo(
        occurrences(markdown, stored.prefix).map((i) => i + stored.prefix.length),
        stored.start,
        MAX_CONTEXT_CANDIDATES,
      )
    : [];
  const ends = hasSuffix
    ? nearestTo(
        occurrences(markdown, stored.suffix),
        stored.end,
        MAX_CONTEXT_CANDIDATES,
      )
    : [];

  const bothFlanks = starts.length > 0 && ends.length > 0;
  // A single flank only pins the span if it is unambiguous on its own.
  if (!bothFlanks && starts.length + ends.length !== 1) return null;

  const candidates: { start: number; end: number }[] = [];
  if (bothFlanks) {
    for (const start of starts) {
      for (const end of ends) {
        if (end > start) candidates.push({ start, end });
      }
    }
  } else if (starts.length > 0) {
    for (const start of starts) candidates.push({ start, end: start + expected });
  } else {
    for (const end of ends) candidates.push({ start: Math.max(0, end - expected), end });
  }

  let best: { start: number; end: number; delta: number } | null = null;
  for (const candidate of candidates) {
    const delta = Math.abs(candidate.end - candidate.start - expected);
    if (delta > tolerance) continue;
    if (
      !best ||
      delta < best.delta ||
      (delta === best.delta &&
        Math.abs(candidate.start - stored.start) < Math.abs(best.start - stored.start))
    ) {
      best = { ...candidate, delta };
    }
  }
  if (!best) return null;

  // Two verbatim flanks pin the span regardless of how much the text between
  // them changed, so length drift only shades the score it does not veto.
  const flanks = bothFlanks ? 1 : 0.8;
  const confidence = flanks * (1 - 0.4 * (best.delta / (tolerance + 1)));
  if (confidence < CONTEXT_MIN_CONFIDENCE) return null;

  return {
    status: "anchored",
    strategy: "context",
    confidence,
    selector: buildSelector(markdown, best.start, best.end),
  };
}

/** Rung 4: approximate match on the quote, preferring hits near the old offset. */
function matchByFuzzy(
  markdown: string,
  stored: SelectorBundle,
): ReanchorResult | null {
  const pattern = stored.exact;
  const maxErrors = Math.min(
    Math.max(1, Math.ceil(pattern.length * FUZZY_ERROR_RATE)),
    Math.max(1, pattern.length - 1),
  );

  const windowStart = Math.max(0, stored.start - FUZZY_WINDOW_PADDING);
  const windowEnd = Math.min(markdown.length, stored.end + FUZZY_WINDOW_PADDING);
  const windowed = windowStart > 0 || windowEnd < markdown.length;

  let offset = 0;
  let matches: ReturnType<typeof search> = [];
  if (windowed) {
    offset = windowStart;
    matches = search(markdown.slice(windowStart, windowEnd), pattern, maxErrors);
  }
  if (matches.length === 0) {
    offset = 0;
    matches = search(markdown, pattern, maxErrors);
  }
  if (matches.length === 0) return null;

  let best = matches[0];
  for (const match of matches) {
    const better =
      match.errors < best.errors ||
      (match.errors === best.errors &&
        Math.abs(match.start + offset - stored.start) <
          Math.abs(best.start + offset - stored.start));
    if (better) best = match;
  }

  const confidence = 1 - best.errors / pattern.length;
  if (confidence < FUZZY_MIN_CONFIDENCE) return null;

  return {
    status: "anchored",
    strategy: "fuzzy",
    confidence,
    selector: buildSelector(markdown, best.start + offset, best.end + offset),
  };
}

/**
 * The re-anchor ladder: stored offsets, then the verbatim quote, then the
 * surrounding context, then a fuzzy match. An extract that falls off the
 * bottom is orphaned, never deleted.
 *
 * Never throws. A caller that cannot re-anchor still gets the stored bundle
 * back so the extract's text survives the failure.
 */
export function reanchor(
  markdown: string,
  stored: SelectorBundle,
): ReanchorResult {
  if (!markdown || !stored.exact) return orphan(stored);

  if (markdown.slice(stored.start, stored.end) === stored.exact) {
    return { status: "anchored", strategy: "offset", confidence: 1, selector: stored };
  }

  const hits = occurrences(markdown, stored.exact);
  if (hits.length > 0) {
    let best = hits[0];
    let bestScore = -1;
    for (const hit of hits) {
      const score = contextScore(markdown, hit, hit + stored.exact.length, stored);
      const better =
        score > bestScore ||
        (score === bestScore &&
          Math.abs(hit - stored.start) < Math.abs(best - stored.start));
      if (better) {
        best = hit;
        bestScore = score;
      }
    }
    return {
      status: "anchored",
      strategy: "quote",
      confidence: 1,
      selector: buildSelector(markdown, best, best + stored.exact.length),
    };
  }

  return matchByContext(markdown, stored) ?? matchByFuzzy(markdown, stored) ?? orphan(stored);
}
