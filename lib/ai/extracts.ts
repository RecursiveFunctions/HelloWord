import { z } from "zod";
import { ExtractProposal } from "../contracts";
import { env } from "../env";
import { chatJson } from "./client";
import type { AiSource } from "./data";
import { mockExtractProposals } from "./mock";
import { EXTRACT_SYSTEM } from "./prompts";

/**
 * Extract proposals. The model picks passages; it never touches offsets.
 * Workstream B resolves each `exact` into a SelectorBundle against the
 * rendered markdown, which is why `exact` being verbatim is enforced here and
 * not left as a hope.
 */

/** One window is one call. A long source gets its opening, not a chunked crawl. */
const MAX_SOURCE_CHARS = 24_000;
const MAX_PROPOSALS = 12;

/**
 * Deliberately looser than ExtractProposal: a priority of 3.5 or a 350-word
 * quote is worth salvaging locally rather than spending a repair round trip on.
 */
const ProposalDraft = z.object({
  proposals: z
    .array(
      z.object({
        exact: z.string(),
        priority: z.number(),
        reason: z.string().default(""),
        concepts: z.array(z.string()).default([]),
      }),
    )
    .min(1),
});

/**
 * Whitespace-tolerant search that returns the source's own characters.
 * Models reliably collapse runs of spaces and newlines when quoting, and the
 * recovered span is still verbatim source text — which is all B needs. A quote
 * that cannot be found at all is dropped rather than guessed at.
 */
export function findVerbatim(markdown: string, quote: string): string | null {
  const trimmed = quote.trim();
  if (!trimmed) return null;
  if (markdown.includes(trimmed)) return trimmed;

  const pattern = trimmed
    .split(/\s+/)
    .map((token) => token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("\\s+");
  const match = new RegExp(pattern).exec(markdown);
  return match ? match[0] : null;
}

function cleanConcepts(concepts: string[]): string[] {
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of concepts) {
    const label = raw.trim().toLowerCase();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    kept.push(label);
    if (kept.length === 5) break;
  }
  return kept;
}

export function sanitizeProposals(
  markdown: string,
  drafts: z.infer<typeof ProposalDraft>["proposals"],
): ExtractProposal[] {
  const kept: ExtractProposal[] = [];
  for (const draft of drafts) {
    const exact = findVerbatim(markdown, draft.exact);
    if (!exact || exact.length < 10) continue;
    // A span already covered by a kept span adds a highlight, not a passage.
    if (kept.some((p) => p.exact.includes(exact) || exact.includes(p.exact))) continue;
    kept.push({
      exact,
      priority: Math.min(100, Math.max(0, Math.round(draft.priority))),
      reason: draft.reason.trim(),
      concepts: cleanConcepts(draft.concepts),
    });
  }
  return kept
    .sort((a, b) => a.priority - b.priority || markdown.indexOf(a.exact) - markdown.indexOf(b.exact))
    .slice(0, MAX_PROPOSALS)
    .map((proposal) => ExtractProposal.parse(proposal));
}

export type ProposeResult = {
  proposals: ExtractProposal[];
  provider: string;
  model: string;
};

export type ExtractExperimentProfile = {
  reasoningMode: "disabled" | "low" | "medium" | "high";
  maxTokens: number;
  temperature: number;
  topP?: number;
};

const PRODUCTION_PROFILE: ExtractExperimentProfile = {
  reasoningMode: "low",
  maxTokens: 4_000,
  temperature: 0.2,
};

export async function proposeExtracts(
  source: AiSource,
  profile: ExtractExperimentProfile = PRODUCTION_PROFILE,
): Promise<ProposeResult> {
  if (env.aiMock) {
    return {
      proposals: mockExtractProposals(source),
      provider: "mock",
      model: "fixtures",
    };
  }

  const excerpt = source.markdown.slice(0, MAX_SOURCE_CHARS);
  const truncated = source.markdown.length > MAX_SOURCE_CHARS;
  const result = await chatJson(ProposalDraft, {
    name: "extract_proposals",
    system: EXTRACT_SYSTEM,
    // Selection benefits from a small, bounded thinking budget.
    reasoningMode: profile.reasoningMode,
    // Nemotron may spend part of this budget reasoning before emitting JSON.
    // Keep enough room for 8 verbatim passages and their short annotations.
    maxTokens: profile.maxTokens,
    temperature: profile.temperature,
    topP: profile.topP,
    user: `Title: ${source.title}
${truncated ? "Excerpt (the document continues past this point):" : "Full text:"}

${excerpt}`,
  });

  return {
    proposals: sanitizeProposals(source.markdown, result.value.proposals),
    provider: result.provider,
    model: result.model,
  };
}
