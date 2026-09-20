/**
 * The condensed reading view: keep the blocks that carry an extract, fold
 * everything else into gaps.
 *
 * This is a filter over parsed blocks and nothing more. The markdown is never
 * rewritten and no offset moves, so anchoring, painting, and manual selection
 * all behave exactly as they do in the full view. Normalisation is a frozen
 * contract (`lib/contracts/markdown.ts`); a view must not be a second writer.
 */
import { spansOf, type Block } from "@/lib/editor/blocks";

export type KeepRange = { start: number; end: number };

export type CondensedItem =
  | { kind: "block"; block: Block }
  | {
      kind: "gap";
      /** Start offset of the first folded block; stable, so it keys expansion. */
      start: number;
      end: number;
      words: number;
      blocks: Block[];
    };

function overlaps(block: Block, range: KeepRange): boolean {
  return range.start < block.end && range.end > block.start;
}

function wordsIn(block: Block): number {
  let count = 0;
  for (const span of spansOf(block)) {
    count += span.text.split(/\s+/).filter(Boolean).length;
  }
  return count;
}

/**
 * `expanded` holds gap `start` offsets the reader has opened. An opened gap
 * dissolves back into ordinary blocks, which is what makes "show me what was
 * around this passage" a single click.
 */
export function condense(
  blocks: readonly Block[],
  keep: readonly KeepRange[],
  expanded: ReadonlySet<number> = new Set(),
): CondensedItem[] {
  const kept = new Set<number>();
  let heading = -1;
  blocks.forEach((block, index) => {
    if (block.kind === "heading") heading = index;
    if (!keep.some((range) => overlaps(block, range))) return;
    kept.add(index);
    // A passage without its section title has lost its context.
    if (heading >= 0) kept.add(heading);
  });

  const items: CondensedItem[] = [];
  let run: Block[] = [];
  const flush = () => {
    if (run.length === 0) return;
    const words = run.reduce((sum, block) => sum + wordsIn(block), 0);
    const start = run[0].start;
    // Folding a rule or an empty run would hide nothing and cost a click.
    if (words === 0 || expanded.has(start)) {
      for (const block of run) items.push({ kind: "block", block });
    } else {
      items.push({ kind: "gap", start, end: run[run.length - 1].end, words, blocks: run });
    }
    run = [];
  };

  blocks.forEach((block, index) => {
    if (kept.has(index)) {
      flush();
      items.push({ kind: "block", block });
    } else {
      run.push(block);
    }
  });
  flush();
  return items;
}
