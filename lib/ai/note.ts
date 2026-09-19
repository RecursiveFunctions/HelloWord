import { z } from "zod";
import { NoteDraft, normalizeMarkdown } from "../contracts";
import { env } from "../env";
import { chatJson } from "./client";
import type { AiExtract } from "./data";
import { mockNoteDraft } from "./mock";
import { NOTE_SYSTEM } from "./prompts";

/**
 * The note is the pivot, so this produces a draft and nothing else. It does not
 * write to `note`, does not set `origin`, and does not decide anything is
 * accepted — the whole point is that a human edits this before it counts.
 */

const MAX_EXTRACT_CHARS = 1_400;
const MAX_TITLE_CHARS = 120;

const NoteDraftDraft = z.object({
  title: z.string().min(1),
  body_md: z.string().min(1),
  concepts: z.array(z.string()).default([]),
});

function cleanTitle(title: string): string {
  const oneLine = title.replace(/\s+/g, " ").replace(/^#+\s*/, "").trim();
  const stripped = oneLine.replace(/^["']|["']$/g, "");
  return stripped.length > MAX_TITLE_CHARS
    ? `${stripped.slice(0, MAX_TITLE_CHARS - 3).trim()}...`
    : stripped;
}

/**
 * The draft is new markdown rather than stored source, so normalizing it here
 * is safe and keeps `hashBody` stable for whatever B saves. The leading
 * heading goes because the title already carries it and the editor renders
 * the two separately.
 */
function cleanBody(body: string, title: string): string {
  let cleaned = normalizeMarkdown(body).trim();
  const heading = /^#{1,6}\s*(.+)\n*/.exec(cleaned);
  if (heading && heading[1].trim().toLowerCase() === title.toLowerCase()) {
    cleaned = cleaned.slice(heading[0].length).trim();
  }
  return normalizeMarkdown(cleaned);
}

function cleanConcepts(concepts: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of concepts) {
    const label = raw.trim().toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    kept.push(label);
    if (kept.length === 8) break;
  }
  return kept;
}

export type DraftResult = { draft: NoteDraft; provider: string; model: string };

export async function draftNote(extracts: AiExtract[]): Promise<DraftResult> {
  if (env.aiMock) {
    return { draft: mockNoteDraft(extracts), provider: "mock", model: "fixtures" };
  }

  const passages = extracts
    .map(
      (extract, index) =>
        `${index + 1}. (priority ${extract.priority}, from "${extract.parent_title}")\n${extract.body_md.slice(0, MAX_EXTRACT_CHARS)}`,
    )
    .join("\n\n");

  const result = await chatJson(NoteDraftDraft, {
    name: "note_draft",
    system: NOTE_SYSTEM,
    // reasoning_effort high: this is composition, and the output is the artifact.
    reasoningEffort: "high",
    maxTokens: 1_600,
    temperature: 0.4,
    user: `Passages the reader kept:\n\n${passages}`,
  });

  const title = cleanTitle(result.value.title);
  const draft = NoteDraft.parse({
    title: title || "Untitled draft",
    body_md: cleanBody(result.value.body_md, title),
    concepts: cleanConcepts(result.value.concepts),
  });

  return { draft, provider: result.provider, model: result.model };
}
