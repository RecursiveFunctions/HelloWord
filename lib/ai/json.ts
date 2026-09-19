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

export function parseJsonLoose(raw: string): LooseJson {
  const text = stripFences(stripReasoning(raw)).trim();
  if (!text) return { ok: false, reason: "response was empty after stripping reasoning" };
  const candidates = [text, balancedJsonSlice(text)];
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
