import { MD_OFFSET_ATTR } from "../editor/blocks";

/**
 * Browser-only bridge between markdown character offsets and DOM ranges.
 *
 * Relies on the contract in `lib/editor/blocks.ts`: every rendered run of text
 * sits in an element carrying `data-md-start`, and that element's text is
 * verbatim source text. So a span covers `[start, start + textLength)` and no
 * character mapping is needed inside it.
 */

type DomSpan = { node: Text; start: number; end: number };

function collectSpans(container: HTMLElement): DomSpan[] {
  const spans: DomSpan[] = [];
  const tagged = container.querySelectorAll<HTMLElement>(`[${MD_OFFSET_ATTR}]`);
  for (const el of Array.from(tagged)) {
    const start = Number(el.getAttribute(MD_OFFSET_ATTR));
    if (!Number.isFinite(start)) continue;
    const node = el.firstChild;
    if (!node || node.nodeType !== Node.TEXT_NODE) continue;
    const text = node as Text;
    spans.push({ node: text, start, end: start + text.length });
  }
  return spans.sort((a, b) => a.start - b.start);
}

function clamp(value: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, value));
}

function buildRange(spans: DomSpan[], start: number, end: number): Range | null {
  if (end <= start) return null;

  // Offsets can land in a gap - a stripped marker, a blank line between
  // blocks - so snap forward to the next span and back to the previous one.
  const from = spans.find((s) => s.end > start);
  let to: DomSpan | undefined;
  for (const span of spans) {
    if (span.start >= end) break;
    to = span;
  }
  if (!from || !to || to.end <= from.start) return null;

  const range = document.createRange();
  range.setStart(from.node, clamp(start - from.start, 0, from.node.length));
  range.setEnd(to.node, clamp(end - to.start, 0, to.node.length));
  return range.collapsed ? null : range;
}

/** Range covering a markdown offset pair, or null if it is not rendered. */
export function rangeForOffsets(
  container: HTMLElement,
  start: number,
  end: number,
): Range | null {
  return buildRange(collectSpans(container), start, end);
}

/**
 * Batch form of `rangeForOffsets`. Walks the DOM once, so painting a hundred
 * extracts costs one traversal rather than a hundred.
 */
export function rangesForOffsets<T extends { start: number; end: number }>(
  container: HTMLElement,
  items: readonly T[],
): Map<T, Range> {
  const spans = collectSpans(container);
  const found = new Map<T, Range>();
  for (const item of items) {
    const range = buildRange(spans, item.start, item.end);
    if (range) found.set(item, range);
  }
  return found;
}

function offsetOf(container: HTMLElement, node: Node, offset: number): number | null {
  const element =
    node.nodeType === Node.TEXT_NODE ? node.parentElement : (node as Element);
  const span = element?.closest(`[${MD_OFFSET_ATTR}]`);
  if (!span || !container.contains(span)) return null;
  const base = Number(span.getAttribute(MD_OFFSET_ATTR));
  if (!Number.isFinite(base)) return null;
  if (node.nodeType === Node.TEXT_NODE) return base + offset;
  // An element boundary: treat it as the end of that span's text.
  return base + (span.textContent?.length ?? 0);
}

/** Markdown offsets for a DOM range, or null if it falls outside the source. */
export function offsetsForRange(
  container: HTMLElement,
  range: Range,
): { start: number; end: number } | null {
  const a = offsetOf(container, range.startContainer, range.startOffset);
  const b = offsetOf(container, range.endContainer, range.endOffset);
  if (a === null || b === null) return null;
  return a <= b ? { start: a, end: b } : { start: b, end: a };
}

/** Markdown offset under a viewport point, or null if it is outside the source. */
export function offsetAtPoint(
  container: HTMLElement,
  x: number,
  y: number,
): number | null {
  const doc = container.ownerDocument;
  const positioned = doc.caretPositionFromPoint?.(x, y);
  if (positioned) {
    return offsetOf(container, positioned.offsetNode, positioned.offset);
  }
  const ranged = doc.caretRangeFromPoint?.(x, y);
  if (ranged) {
    return offsetOf(container, ranged.startContainer, ranged.startOffset);
  }
  return null;
}

/** Markdown offsets for the user's current selection inside `container`. */
export function offsetsForSelection(
  container: HTMLElement,
): { start: number; end: number } | null {
  const selection = document.getSelection();
  if (!selection || selection.isCollapsed || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;
  return offsetsForRange(container, range);
}

/**
 * Whether highlights can be painted without wrapping the text in elements.
 * Baseline since March 2026, but a false here must degrade rather than crash.
 */
export function supportsCustomHighlight(): boolean {
  return typeof CSS !== "undefined" && "highlights" in CSS;
}

/** Register a named highlight. Painting an empty set clears it. */
export function paintHighlight(name: string, ranges: readonly Range[]): void {
  if (!supportsCustomHighlight()) return;
  if (ranges.length === 0) {
    CSS.highlights.delete(name);
    return;
  }
  CSS.highlights.set(name, new Highlight(...ranges));
}

export function clearHighlight(name: string): void {
  if (!supportsCustomHighlight()) return;
  CSS.highlights.delete(name);
}
