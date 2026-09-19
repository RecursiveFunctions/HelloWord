import type { SelectorBundle } from "../contracts/anchor";

export function selectorFor(markdown: string, exact: string): SelectorBundle {
  const start = markdown.indexOf(exact);
  if (start < 0) {
    throw new Error(`Seed quote not found: ${exact.slice(0, 80)}`);
  }
  const end = start + exact.length;
  return {
    exact,
    prefix: markdown.slice(Math.max(0, start - 32), start),
    suffix: markdown.slice(end, end + 32),
    start,
    end,
  };
}
