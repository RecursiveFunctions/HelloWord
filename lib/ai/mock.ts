import {
  ActivityBatch,
  type ActivityPayload,
  type ActivityType,
  Diagnostics,
  ExtractProposal,
  NoteDraft,
} from "../contracts";
import {
  activities as seedActivities,
  conceptExtracts,
  concepts,
  extracts as seedExtracts,
  ids,
} from "../seed";
import type { AiExtract, AiNote, AiSource } from "./data";
import activityFixture from "./__fixtures__/activity-batch.json";
import diagnosticsFixture from "./__fixtures__/diagnostics.json";
import extractProposalsFixture from "./__fixtures__/extract-proposals.json";
import noteDraftFixture from "./__fixtures__/note-draft.json";

/**
 * What `AI_MOCK=1` returns. No network, no keys, no quota — A, B and D develop
 * against this and it must never stop working.
 *
 * The four fixture files landed in the wave 0 contracts commit and other
 * workstreams read them directly, so they are never edited here. Anything the
 * fixtures cannot cover (a source they were not written for, a note with its
 * own seeded questions) is derived from lib/seed instead, which keeps mock
 * output plausible for every id in the seed rather than only the one document
 * the fixtures describe.
 */

/** Fixtures are parsed through the contracts, so drift fails loudly. */
function memo<T>(load: () => T): () => T {
  let value: T | undefined;
  return () => (value ??= load());
}

const fixtureProposals = memo(() =>
  ExtractProposal.array().parse(extractProposalsFixture),
);
const fixtureNoteDraft = memo(() => NoteDraft.parse(noteDraftFixture));
const fixtureActivities = memo(() => ActivityBatch.parse(activityFixture).activities);
const fixtureDiagnostics = memo(() => Diagnostics.parse(diagnosticsFixture));

const conceptLabelById = new Map(concepts.map((c) => [c.id, c.label]));

function seedConceptsForExtract(extractId: string): string[] {
  return conceptExtracts
    .filter((row) => row.extract_id === extractId)
    .map((row) => conceptLabelById.get(row.concept_id))
    .filter((label): label is string => label !== undefined)
    .slice(0, 5);
}

/** Proposals the fixtures describe, but only for a source that truly contains them. */
function fixtureProposalsIn(markdown: string): ExtractProposal[] {
  return fixtureProposals().filter((p) => markdown.includes(p.exact));
}

/** Seeded extracts for this source, replayed as if the model had just proposed them. */
function seedProposalsFor(sourceId: string): ExtractProposal[] {
  return seedExtracts
    .filter((extract) => extract.source_id === sourceId)
    .map((extract) => ({
      exact: extract.body_md,
      priority: extract.priority,
      reason:
        extract.suggested_by === "nemotron"
          ? "Proposed as a standalone claim worth keeping."
          : "Kept before; still the load-bearing sentence in this paragraph.",
      concepts: seedConceptsForExtract(extract.id),
    }))
    .sort((a, b) => a.priority - b.priority);
}

const CLAIM_VERB = /\b(is|are|means|should|must|cannot|never|always)\b/i;
const FIGURE = /\d/;

/**
 * Last resort for a source the seed has never seen — a real PDF someone just
 * ingested while running in mock mode. A margin rail with nothing in it looks
 * broken, so pick claim-shaped sentences deterministically instead.
 */
function heuristicProposals(markdown: string): ExtractProposal[] {
  const paragraphs = markdown
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line.length > 0 &&
        !line.startsWith("#") &&
        !line.startsWith(">") &&
        !line.startsWith("|") &&
        !line.startsWith("```") &&
        !/^([-*+]|\d+\.)\s/.test(line),
    );

  const candidates: { exact: string; score: number; reason: string }[] = [];
  for (const paragraph of paragraphs) {
    for (const raw of paragraph.split(/(?<=[.!?])\s+/)) {
      const exact = raw.trim();
      if (exact.length < 40 || exact.length > 280) continue;
      const claim = CLAIM_VERB.test(exact);
      const figure = FIGURE.test(exact);
      candidates.push({
        exact,
        // Nearer 140 characters is nearer "one quotable claim".
        score: -Math.abs(exact.length - 140) + (claim ? 60 : 0) + (figure ? 20 : 0),
        reason: figure
          ? "Carries a specific figure worth recalling."
          : claim
            ? "States a claim in a single sentence."
            : "Dense enough to stand on its own as a span.",
      });
    }
  }

  return candidates
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .sort((a, b) => markdown.indexOf(a.exact) - markdown.indexOf(b.exact))
    .map((candidate, index) => ({
      exact: candidate.exact,
      priority: Math.min(100, 10 + index * 8),
      reason: candidate.reason,
      concepts: [],
    }));
}

export function mockExtractProposals(source: AiSource): ExtractProposal[] {
  const fromFixture = fixtureProposalsIn(source.markdown);
  if (fromFixture.length > 0) return fromFixture;
  const fromSeed = seedProposalsFor(source.id);
  if (fromSeed.length > 0) return fromSeed;
  return heuristicProposals(source.markdown);
}

const FSRS_SOURCE_EXTRACTS = new Set(
  seedExtracts.filter((e) => e.source_id === ids.source.fsrs).map((e) => e.id),
);

function draftTitleFrom(body: string): string {
  const firstClause = body.split(/(?<=[.!?])\s|,\s|—/)[0].trim();
  const trimmed = firstClause.length > 60 ? `${firstClause.slice(0, 57).trim()}...` : firstClause;
  return trimmed.replace(/[.!?]+$/, "") || "Untitled draft";
}

export function mockNoteDraft(extracts: AiExtract[]): NoteDraft {
  // The fixture was written about the FSRS source, so only claim it there.
  const allFsrs =
    extracts.length > 0 && extracts.every((e) => FSRS_SOURCE_EXTRACTS.has(e.id));
  if (allFsrs) return fixtureNoteDraft();

  const lead = extracts[0]?.body_md ?? "";
  const bullets = extracts
    .map((extract) => `- ${extract.body_md.replace(/\s+/g, " ").trim()}`)
    .join("\n");
  const conceptLabels = [
    ...new Set(extracts.flatMap((extract) => seedConceptsForExtract(extract.id))),
  ].slice(0, 8);

  return NoteDraft.parse({
    title: draftTitleFrom(lead),
    body_md: `Draft from ${extracts.length} extract${extracts.length === 1 ? "" : "s"} in ${extracts[0]?.parent_title ?? "the source"}. Rewrite this in your own words before generating activities.\n\n${bullets}\n`,
    concepts: conceptLabels,
  });
}

export function mockActivityBatch(
  note: AiNote,
  types: ActivityType[],
  count: number,
): ActivityBatch {
  const wanted = new Set<string>(types);
  // Seeded questions for this exact note first: they are about the right note.
  const pool: ActivityPayload[] = [
    ...seedActivities
      .filter((activity) => activity.note_id === note.id && wanted.has(activity.type))
      .map((activity) => activity.payload),
    ...fixtureActivities().filter((payload) => wanted.has(payload.type)),
  ];

  const chosen: ActivityPayload[] = [];
  const limit = Math.max(1, Math.min(count, 12));
  for (let i = 0; i < limit && pool.length > 0; i++) {
    chosen.push(pool[i % pool.length]);
  }
  return ActivityBatch.parse({ activities: chosen });
}

export function mockDiagnostics(): Diagnostics {
  return fixtureDiagnostics();
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Same text, same vector, every run — so mock embeddings can be compared with
 * `<=>` and a similarity query returns something stable to look at.
 */
export function deterministicVector(text: string, dims: number): number[] {
  let state = fnv1a(text) || 1;
  const values: number[] = [];
  for (let i = 0; i < dims; i++) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    values.push(state / 0xffffffff - 0.5);
  }
  const norm = Math.sqrt(values.reduce((acc, v) => acc + v * v, 0)) || 1;
  return values.map((value) => value / norm);
}
