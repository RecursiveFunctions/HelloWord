/**
 * Turning what a reasoning model actually returns into JSON.
 *
 * Nemotron 3 emits `<think>` traces and likes to wrap answers in code fences
 * even when told not to, so every response goes through here before Zod sees it.
 */

export type LooseJson =
  | { ok: true; value: unknown }
  | { ok: false; reason: string };

/** Reasoning traces sit before the answer, so keep what follows the last one. */
export function stripReasoning(raw: string): string {
  const closed = /<\/(?:think|thinking)>/gi;
  let end = -1;
  for (let match = closed.exec(raw); match; match = closed.exec(raw)) {
    end = match.index + match[0].length;
  }
  const tail = end >= 0 ? raw.slice(end) : raw;
  // An unclosed trace means the answer never arrived; drop it and let the
  // caller retry rather than trying to parse half a thought.
  return tail.replace(/<(?:think|thinking)>[\s\S]*$/i, "");
}

export function stripFences(raw: string): string {
  const fenced = raw.match(/```(?:json|JSON)?\s*([\s\S]*?)```/);
  return fenced ? fenced[1] : raw;
}

/**
 * First balanced object or array in the text, string- and escape-aware so a
 * brace inside a quoted answer does not end the scan early.
 */
export function balancedJsonSlice(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const open = text[start];
  const close = open === "{" ? "}" : "]";
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === open) depth++;
    else if (char === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

/**
 * Close a JSON document that the model ran out of tokens mid-way through.
 *
 * Only ever drops. It rewinds to the last element boundary of the *outermost*
 * unfinished container and appends the closers still open there, so a batch cut
 * off inside its ninth proposal comes back as eight whole proposals rather than
 * eight plus a fragment the schema would reject on the fragment's behalf.
 *
 * Returns null when nothing finished, when the braces do not match, or when the
 * document was never truncated in the first place.
 */
export function closeTruncatedJson(text: string): string | null {
  const start = text.search(/[[{]/);
  if (start < 0) return null;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  // text.slice(start, safeEnd) is a run of finished elements inside safeStack.
  // Shallower boundaries win, because a deeper one sits inside the element that
  // got cut off and would keep half of it.
  let safeEnd = -1;
  let safeStack: string[] = [];
  let safeDepth = Number.POSITIVE_INFINITY;

  const mark = (end: number) => {
    if (stack.length > safeDepth) return;
    safeDepth = stack.length;
    safeEnd = end;
    safeStack = [...stack];
  };

  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
    } else if (char === "}" || char === "]") {
      if (stack.pop() !== char) return null;
      // A document that closes its own outermost container is not truncated.
      if (stack.length === 0) return null;
      mark(i + 1);
    } else if (char === ",") {
      // Everything up to the separator is a finished element.
      mark(i);
    }
  }

  if (stack.length === 0 || safeEnd < 0) return null;
  return text.slice(start, safeEnd) + safeStack.reverse().join("");
}

/** The answer with reasoning traces and code fences removed. */
export function answerText(raw: string): string {
  return stripFences(stripReasoning(raw)).trim();
}

export function parseJsonLoose(raw: string): LooseJson {
  const text = answerText(raw);
  if (!text) return { ok: false, reason: "response was empty after stripping reasoning" };
  // Salvage is last: it only runs once strict parsing has already failed.
  const candidates = [text, balancedJsonSlice(text), closeTruncatedJson(text)];
  for (const candidate of candidates) {
    if (!candidate) continue;
    try {
      return { ok: true, value: JSON.parse(candidate) };
    } catch {
      continue;
    }
  }
  return {
    ok: false,
    reason: `no JSON found in: ${text.slice(0, 200)}`,
  };
}
