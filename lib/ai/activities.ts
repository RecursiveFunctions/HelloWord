import { z } from "zod";
import {
  ActivityBatch,
  type ActivityPayload,
  type ActivityType,
} from "../contracts";
import { env } from "../env";
import { chatJson } from "./client";
import type { AiNote } from "./data";
import { AiProviderError } from "./errors";
import { mockActivityBatch } from "./mock";
import { ACTIVITY_SYSTEM } from "./prompts";

/**
 * Activities are generated from the note as edited, never from a source.
 *
 * ActivityPayload is the highest-traffic contract in the system — D renders and
 * grades exactly what this returns — so a question that would not satisfy the
 * union is repaired where the fix is mechanical (an answer given as "B", a
 * duplicated option, more options than the union allows) and dropped where it
 * is not (an answer that matches nothing, a blank with no accepted text).
 * Silently shipping a question whose answer key is wrong is worse than
 * shipping fewer questions.
 */

const MAX_NOTE_CHARS = 8_000;
const MAX_BATCH = 12;
const MCQ_MAX_OPTIONS = 6;
const SELECT_ALL_MAX_OPTIONS = 8;
const MIN_OPTIONS = 3;

const Indexish = z.union([z.number(), z.string()]);
const Stringish = z.union([z.array(z.string()), z.string()]);

const LooseActivity = z.object({
  type: z.string(),
  stem: z.string().optional(),
  options: z.array(z.string()).optional(),
  answer: Indexish.optional(),
  answers: z.array(Indexish).optional(),
  explanation: z.string().optional(),
  template: z.string().optional(),
  blanks: z
    .array(
      z.object({
        id: z.number().optional(),
        accepted: Stringish.optional(),
        hint: z.string().optional(),
      }),
    )
    .optional(),
  accepted: Stringish.optional(),
  hint: z.string().optional(),
});

const ActivityDraft = z.object({
  activities: z.array(LooseActivity).min(1),
});

type LooseActivity = z.infer<typeof LooseActivity>;

export function normalizeActivityBatch(value: unknown): unknown {
  return Array.isArray(value) ? { activities: value } : value;
}

function asArray(value: string[] | string | undefined): string[] {
  if (value === undefined) return [];
  const list = Array.isArray(value) ? value : [value];
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const raw of list) {
    const text = raw.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    kept.push(text);
  }
  return kept;
}

/** "B", "2", 1, or the option's own text all mean an index. */
function resolveIndex(value: unknown, options: string[]): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    const index = Math.trunc(value);
    return index >= 0 && index < options.length ? index : undefined;
  }
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (!text) return undefined;

  const exact = options.findIndex(
    (option) => option.trim().toLowerCase() === text.toLowerCase(),
  );
  if (exact >= 0) return exact;

  if (/^[A-Za-z]$/.test(text)) {
    const index = text.toUpperCase().charCodeAt(0) - 65;
    return index >= 0 && index < options.length ? index : undefined;
  }

  const numeric = Number(text);
  if (Number.isFinite(numeric)) {
    const index = Math.trunc(numeric);
    return index >= 0 && index < options.length ? index : undefined;
  }
  return undefined;
}

/** Deduping options moves them, so the answer indexes move with them. */
function dedupeOptions(options: string[]): { options: string[]; map: Map<number, number> } {
  const seen = new Map<string, number>();
  const kept: string[] = [];
  const map = new Map<number, number>();
  options.forEach((raw, index) => {
    const text = raw.trim();
    if (!text) return;
    const key = text.toLowerCase();
    const existing = seen.get(key);
    if (existing !== undefined) {
      map.set(index, existing);
      return;
    }
    const position = kept.length;
    kept.push(text);
    seen.set(key, position);
    map.set(index, position);
  });
  return { options: kept, map };
}

/** Too many options: keep every correct one, then fill up in original order. */
function capOptions(
  options: string[],
  answers: number[],
  max: number,
): { options: string[]; answers: number[] } | null {
  if (options.length <= max) return { options, answers };
  if (answers.length > max) return null;
  const keep = new Set(answers);
  for (let i = 0; i < options.length && keep.size < max; i++) keep.add(i);
  const ordered = [...keep].sort((a, b) => a - b);
  return {
    options: ordered.map((index) => options[index]),
    answers: answers.map((answer) => ordered.indexOf(answer)),
  };
}

const PLACEHOLDER = /\{\{\s*(\d+)\s*\}\}/g;

function placeholderIds(template: string): number[] {
  const ids: number[] = [];
  for (let match = PLACEHOLDER.exec(template); match; match = PLACEHOLDER.exec(template)) {
    const id = Number(match[1]);
    if (id > 0 && !ids.includes(id)) ids.push(id);
  }
  PLACEHOLDER.lastIndex = 0;
  return ids;
}

/** Null means the question could not be made valid without inventing an answer. */
export function repairActivity(draft: LooseActivity): ActivityPayload | null {
  const type = draft.type.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const stem = draft.stem?.trim() ?? "";
  const explanation = draft.explanation?.trim();

  if (type === "mcq" || type === "select_all") {
    if (!stem) return null;
    const deduped = dedupeOptions(draft.options ?? []);
    if (deduped.options.length < MIN_OPTIONS) return null;

    const rawAnswers =
      type === "mcq"
        ? draft.answer !== undefined
          ? [draft.answer]
          : []
        : (draft.answers ?? []);
    const resolved = [
      ...new Set(
        rawAnswers
          .map((value) => {
            const index = resolveIndex(value, draft.options ?? []);
            // Remap through the dedupe, or resolve against the deduped list
            // when the model answered with the option's text.
            if (index !== undefined) return deduped.map.get(index) ?? index;
            return resolveIndex(value, deduped.options);
          })
          .filter((index): index is number => index !== undefined),
      ),
    ].sort((a, b) => a - b);
    if (resolved.length === 0) return null;
    if (type === "mcq" && resolved.length !== 1) return null;

    const capped = capOptions(
      deduped.options,
      resolved,
      type === "mcq" ? MCQ_MAX_OPTIONS : SELECT_ALL_MAX_OPTIONS,
    );
    if (!capped || capped.options.length < MIN_OPTIONS) return null;
    if (capped.answers.some((index) => index < 0 || index >= capped.options.length)) {
      return null;
    }

    if (type === "mcq") {
      return {
        type: "mcq",
        stem,
        options: capped.options,
        answer: capped.answers[0],
        ...(explanation ? { explanation } : {}),
      };
    }
    return {
      type: "select_all",
      stem,
      options: capped.options,
      answers: capped.answers,
      ...(explanation ? { explanation } : {}),
    };
  }

  if (type === "fill_blank") {
    const template = draft.template?.trim() ?? "";
    const ids = placeholderIds(template);
    if (ids.length === 0) return null;

    const byId = new Map<number, { accepted: string[]; hint?: string }>();
    (draft.blanks ?? []).forEach((blank, index) => {
      // An unnumbered blank is taken positionally, which is what the model meant.
      const id = blank.id && blank.id > 0 ? blank.id : ids[index];
      if (id === undefined || byId.has(id)) return;
      const accepted = asArray(blank.accepted);
      if (accepted.length === 0) return;
      byId.set(id, { accepted, hint: blank.hint?.trim() || undefined });
    });

    // Every placeholder needs an answer; we will not invent one.
    if (ids.some((id) => !byId.has(id))) return null;

    return {
      type: "fill_blank",
      template,
      blanks: ids.map((id) => {
        const blank = byId.get(id)!;
        return {
          id,
          accepted: blank.accepted,
          ...(blank.hint ? { hint: blank.hint } : {}),
        };
      }),
    };
  }

  if (type === "closed") {
    const answer = asArray(draft.answer !== undefined ? String(draft.answer) : undefined)[0];
    if (!stem || !answer) return null;
    const accepted = asArray(draft.accepted).filter(
      (text) => text.toLowerCase() !== answer.toLowerCase(),
    );
    return {
      type: "closed",
      stem,
      answer,
      accepted,
      ...(draft.hint?.trim() ? { hint: draft.hint.trim() } : {}),
    };
  }

  return null;
}

function identity(payload: ActivityPayload): string {
  const text = payload.type === "fill_blank" ? payload.template : payload.stem;
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

export function repairBatch(
  drafts: LooseActivity[],
  types: ActivityType[],
  seen: Set<string>,
): ActivityPayload[] {
  const wanted = new Set<string>(types);
  const kept: ActivityPayload[] = [];
  for (const draft of drafts) {
    const payload = repairActivity(draft);
    if (!payload || !wanted.has(payload.type)) continue;
    const key = identity(payload);
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push(payload);
  }
  return kept;
}

function requestFor(note: AiNote, types: ActivityType[], count: number, avoid: string[]): string {
  const spread =
    types.length > 1
      ? `Spread them across these types: ${types.join(", ")}.`
      : `Every question must be type "${types[0]}".`;
  const already = avoid.length
    ? `\n\nDo not repeat these questions:\n${avoid.map((stem) => `- ${stem}`).join("\n")}`
    : "";
  return `Note title: ${note.title}

Note body:
${note.body_md.slice(0, MAX_NOTE_CHARS)}

Write exactly ${count} question${count === 1 ? "" : "s"}. ${spread}${already}`;
}

export type ActivitiesResult = {
  batch: ActivityBatch;
  provider: string;
  model: string;
};

export async function generateActivities(
  note: AiNote,
  types: ActivityType[],
  count: number,
): Promise<ActivitiesResult> {
  if (env.aiMock) {
    return {
      batch: mockActivityBatch(note, types, count),
      provider: "mock",
      model: "fixtures",
    };
  }

  const target = Math.max(1, Math.min(count, MAX_BATCH));
  const seen = new Set<string>();
  const kept: ActivityPayload[] = [];
  let provider = "";
  let model = "";

  const first = await chatJson(ActivityDraft, {
    name: "activity_batch",
    system: ACTIVITY_SYSTEM,
    normalize: normalizeActivityBatch,
    // reasoning_effort high: an answer key is not a creative writing exercise.
    reasoningEffort: "high",
    maxTokens: 3_000,
    temperature: 0.5,
    user: requestFor(note, types, target, []),
  });
  provider = first.provider;
  model = first.model;
  kept.push(...repairBatch(first.value.activities, types, seen));

  // One top-up call, only if repairs cost us questions the caller asked for.
  if (kept.length < target) {
    try {
      const topUp = await chatJson(ActivityDraft, {
        name: "activity_batch",
        system: ACTIVITY_SYSTEM,
        normalize: normalizeActivityBatch,
        reasoningEffort: "high",
        maxTokens: 3_000,
        temperature: 0.6,
        user: requestFor(note, types, target - kept.length, [...seen]),
      });
      provider = topUp.provider;
      model = topUp.model;
      kept.push(...repairBatch(topUp.value.activities, types, seen));
    } catch (error) {
      // A failed top-up is not a failed request; we still have real questions.
      if (kept.length === 0) throw error;
    }
  }

  if (kept.length === 0) {
    throw new AiProviderError([
      `${provider || "provider"}: no question in the batch could be made to satisfy ActivityPayload`,
    ]);
  }

  return {
    batch: ActivityBatch.parse({ activities: kept.slice(0, target) }),
    provider,
    model,
  };
}
