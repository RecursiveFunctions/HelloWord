/**
 * Shaping helpers that run *before* `normalizeMarkdown`.
 *
 * The frozen contract in `lib/contracts/markdown.ts` says one paragraph is one
 * line and that page breaks never become markers in the text. PDF extractors
 * hand back one line per *visual* line, with no blank lines anywhere, so this
 * file is where that gets turned back into paragraphs. Every offset B stores
 * depends on this being the only place that reshapes text — see Seam 3 in
 * PLAN.md, where mismatched normalization is named as the likeliest silent
 * failure in the whole build.
 */

/** "12", "Page 12", "12 | Journal of Things", "- 12 -". */
const PAGE_FURNITURE = /^(?:page\s+)?[-–—\s|]*\d{1,4}[-–—\s|]*(?:\s*\|.*)?$/i;

/** "3", "3.1", "4.2.1" followed by a capitalised word. */
const NUMBERED_SECTION = /^(\d+(?:\.\d+)*)\.?\s+\p{Lu}/u;

const NAMED_SECTION =
  /^(abstract|introduction|background|related work|conclusions?|references|acknowledge?ments?|appendix|discussion|results?|methods?|future work)\b[:.]?$/i;

/**
 * Fraction of the surrounding line width at which a line counts as "full", and
 * so as having wrapped into the next one. A line shorter than this ends its
 * paragraph, which is what a paragraph's last line, a heading, and an author
 * byline all have in common.
 */
const FULL_LINE_RATIO = 0.85;

/** How many lines either side define "surrounding". */
const WINDOW = 3;

export function reflowExtractedText(pages: string[]): string {
  const running = runningHeaders(pages);

  const cleaned = pages.map((page) =>
    page
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => !PAGE_FURNITURE.test(line))
      .filter((line) => !running.has(line.toLowerCase())),
  );

  const allLines = cleaned.flat();
  const vocabulary = wordsIn(allLines);
  // Short lines are never treated as wrapped, however short their neighbours
  // are. Without this, a run of similar-length table rows reads as one
  // paragraph. Scaled to the document so a narrow-column layout still works.
  const floor = Math.min(45, bodyLineWidth(allLines) * 0.5);

  const blocks: string[] = [];
  for (const lines of cleaned) {
    const wrapped = lines.map((line, index) => {
      if (line.length < floor) return false;
      // Compared against neighbours rather than a page-wide measure: a title
      // page sets its abstract and its footnotes in two different widths, and
      // any single number for the page is wrong for one of them.
      const from = Math.max(0, index - WINDOW);
      const to = Math.min(lines.length, index + WINDOW + 1);
      let localMax = 0;
      for (let i = from; i < to; i++) {
        localMax = Math.max(localMax, lines[i].length);
      }
      return line.length >= localMax * FULL_LINE_RATIO;
    });

    let paragraph = "";
    let previousWrapped = false;

    for (const [index, line] of lines.entries()) {
      if (!line) {
        if (paragraph) blocks.push(paragraph);
        paragraph = "";
        previousWrapped = false;
        continue;
      }

      if (paragraph && previousWrapped) {
        paragraph = joinWrapped(paragraph, line, vocabulary);
      } else {
        if (paragraph) blocks.push(paragraph);
        paragraph = line;
      }
      previousWrapped = wrapped[index];
    }
    if (paragraph) blocks.push(paragraph);
  }

  return blocks.map(asMarkdown).join("\n\n");
}

/**
 * A hyphen at a line break is ambiguous: LaTeX breaks at real compounds like
 * "position-wise" far more often than it hyphenates a word like "incre-mental".
 * So drop the hyphen only when the document elsewhere uses the joined form as
 * one word, and keep it otherwise.
 */
function joinWrapped(
  paragraph: string,
  line: string,
  vocabulary: Set<string>,
): string {
  const tail = paragraph.match(/(\p{L}+)-$/u);
  if (!tail) return `${paragraph} ${line}`;

  const head = line.match(/^(\p{L}+)/u)?.[1] ?? "";
  const merged = `${tail[1]}${head}`.toLowerCase();

  return vocabulary.has(merged)
    ? paragraph.replace(/-$/, "") + line
    : paragraph + line;
}

/**
 * A high percentile rather than the mean, because headings, bylines, and
 * paragraph-final lines all drag the average below the real measure of the
 * text block.
 */
function bodyLineWidth(lines: string[]): number {
  const lengths = lines
    .map((line) => line.length)
    .filter((length) => length > 20)
    .sort((a, b) => a - b);

  if (lengths.length === 0) return 80;
  return lengths[Math.floor(lengths.length * 0.8)] ?? 80;
}

function wordsIn(lines: string[]): Set<string> {
  const words = new Set<string>();
  for (const line of lines) {
    for (const word of line.toLowerCase().match(/\p{L}+/gu) ?? []) {
      words.add(word);
    }
  }
  return words;
}

/**
 * Promote a block to a heading only when it is unmistakably one. A sentence
 * wrongly turned into an `##` is more disruptive in the reader than a heading
 * left as a paragraph, and author bylines look exactly like short headings.
 */
function asMarkdown(block: string): string {
  if (block.length > 100 || block.includes("\n")) return block;

  const numbered = block.match(NUMBERED_SECTION);
  if (numbered) {
    const depth = Math.min(numbered[1].split(".").length, 4);
    return `${"#".repeat(depth + 1)} ${block}`;
  }

  if (NAMED_SECTION.test(block)) return `## ${block}`;
  return block;
}

/** Lines repeated at the top or bottom of most pages are journal furniture. */
function runningHeaders(pages: string[]): Set<string> {
  if (pages.length < 3) return new Set();

  const counts = new Map<string, number>();
  for (const page of pages) {
    const lines = page
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of [lines[0], lines[lines.length - 1]]) {
      if (!line || line.length > 90) continue;
      const key = line.toLowerCase();
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const threshold = Math.max(3, Math.ceil(pages.length * 0.6));
  return new Set(
    [...counts.entries()]
      .filter(([, count]) => count >= threshold)
      .map(([line]) => line),
  );
}

/**
 * Whether an extractor actually found a text layer. A scanned PDF returns a
 * handful of stray ligatures per page rather than nothing at all, so this tests
 * density rather than emptiness.
 */
export function hasUsableText(text: string, pages = 1): boolean {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 40) return false;
  return words.length / Math.max(1, pages) >= 20;
}

export function deriveTitle(markdown: string, fallback: string): string {
  const heading = markdown.match(/^#{1,3}\s+(.+)$/m)?.[1]?.trim();
  if (heading) return heading.slice(0, 200);

  const firstLine = markdown
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (firstLine && firstLine.length <= 120) {
    return firstLine.replace(/^#+\s*/, "").slice(0, 200);
  }
  return fallback;
}

/** "https://jvns.ca/2026/01/a-post/" -> "jvns.ca — a post". */
export function titleFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const slug = parsed.pathname
      .split("/")
      .filter(Boolean)
      .pop()
      ?.replace(/\.[a-z]{2,5}$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    return slug ? `${parsed.hostname} — ${slug}` : parsed.hostname;
  } catch {
    return url.slice(0, 200);
  }
}
