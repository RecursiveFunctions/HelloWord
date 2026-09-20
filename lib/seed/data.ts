import type { ActivityPayload } from "../contracts/activity";
import type { SelectorBundle } from "../contracts/anchor";
import { hashBody } from "../hash";
import { normalizeMarkdown } from "../contracts/markdown";
import { THEME_SWATCHES } from "../themes";
import { ids, SEED_NOW } from "./ids";
import { selectorFor } from "./selector";
import { sourceMarkdown, sourceWordCounts } from "./sources";

export type SeedSource = {
  id: string;
  kind: "pdf" | "url";
  title: string;
  origin_uri: string;
  storage_key: string | null;
  markdown: string;
  ingest_status: "ready";
  ingest_method: "unpdf" | "defuddle";
  word_count: number;
  created_at: string;
};

export type SeedNote = {
  id: string;
  title: string;
  body_md: string;
  body_hash: string;
  origin: "human" | "ai_drafted" | "ai_edited";
  created_at: string;
  updated_at: string;
};

export type SeedExtract = {
  id: string;
  source_id: string;
  note_id: null;
  body_md: string;
  priority: number;
  selector: SelectorBundle;
  anchor_status: "anchored" | "orphaned" | "detached";
  suggested_by: "human" | "nemotron";
  accepted: boolean;
  created_at: string;
};

export type SeedActivity = {
  id: string;
  note_id: string | null;
  extract_id: string | null;
  type: ActivityPayload["type"];
  payload: ActivityPayload;
  source_body_hash: string | null;
  variant_of: string | null;
  created_at: string;
};

export type SeedSchedule = {
  activity_id: string;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review: string | null;
  a_factor: number;
};

export type SeedNotebook = {
  id: string;
  name: string;
  description: string;
  color: string;
  cover_storage_key: string | null;
  created_at: string;
};

export type SeedNotebookItem = {
  notebook_id: string;
  item_type: "source" | "note" | "extract" | "activity";
  item_id: string;
  added_at: string;
};

export type SeedConcept = { id: string; label: string };

const iso = (d: Date) => d.toISOString();
const daysAgo = (n: number) =>
  iso(new Date(SEED_NOW.getTime() - n * 86_400_000));

function note(
  n: number,
  title: string,
  body: string,
  origin: SeedNote["origin"],
  days: number,
): SeedNote {
  const body_md = normalizeMarkdown(body);
  return {
    id: ids.note(n),
    title,
    body_md,
    body_hash: hashBody(body_md),
    origin,
    created_at: daysAgo(days),
    updated_at: daysAgo(Math.max(0, days - 2)),
  };
}

export const notebooks: SeedNotebook[] = [
  {
    id: ids.notebook.fsrs,
    name: "Spaced repetition",
    description: "FSRS, retention, and why we keep an A-factor beside the card rather than inside the model.",
    color: THEME_SWATCHES.yellow,
    cover_storage_key: null,
    created_at: daysAgo(80),
  },
  {
    id: ids.notebook.ir,
    name: "Incremental reading",
    description: "Queues, extracts, notes, and the human edit between highlighting and being tested.",
    color: THEME_SWATCHES.blue,
    cover_storage_key: null,
    created_at: daysAgo(70),
  },
];

export const sources: SeedSource[] = [
  {
    id: ids.source.fsrs,
    kind: "pdf",
    title: "FSRS without an A-factor",
    origin_uri: "spaces://helloword-seed/fsrs-without-a-factor.pdf",
    storage_key: "seed/fsrs-without-a-factor.pdf",
    markdown: sourceMarkdown.fsrs,
    ingest_status: "ready",
    ingest_method: "unpdf",
    word_count: sourceWordCounts.fsrs,
    created_at: daysAgo(60),
  },
  {
    id: ids.source.queue,
    kind: "url",
    title: "Incremental reading is a queue",
    origin_uri: "https://example.invalid/incremental-reading-queue",
    storage_key: null,
    markdown: sourceMarkdown.queue,
    ingest_status: "ready",
    ingest_method: "defuddle",
    word_count: sourceWordCounts.queue,
    created_at: daysAgo(55),
  },
  {
    id: ids.source.pivot,
    kind: "url",
    title: "The note is the pivot",
    origin_uri: "https://example.invalid/note-is-the-pivot",
    storage_key: null,
    markdown: sourceMarkdown.pivot,
    ingest_status: "ready",
    ingest_method: "defuddle",
    word_count: sourceWordCounts.pivot,
    created_at: daysAgo(50),
  },
];

export const notes: SeedNote[] = [
  note(1, "FSRS has no A-factor", "FSRS does not use an ease factor. It estimates retrievability from stability and difficulty, then schedules so retrievability at the next due date matches the retention I asked for.", "ai_edited", 40),
  note(2, "Override after the model", "If I want SuperMemo's A-factor, it should multiply the interval FSRS already chose. It must not be written back into stability.", "human", 38),
  note(3, "Retention is the honest knob", "Raising request_retention from 0.90 to 0.95 shortens every interval because the model is aiming at a higher chance of recall. That is the principled way to see cards more often.", "ai_drafted", 36),
  note(4, "Compress the day, not the interval", "Demo mode has to redefine the unit of a day in both directions. Scaling intervals down while leaving elapsed days in wall-clock time makes FSRS think I recalled too early.", "ai_edited", 34),
  note(5, "Piles are not queues", "A read-later pile has no next item. A queue is a promise that the next span I see is the most important unread one.", "human", 32),
  note(6, "Priority floats low numbers", "Priority is 0-100 and lower surfaces first. It is a ranking of what should appear next, not a score of how important the idea is in the universe.", "ai_drafted", 30),
  note(7, "Extracts are not notes", "An extract is a span I might want to keep. A note is the sentence I would say tomorrow. Only notes should become questions.", "ai_edited", 28),
  note(8, "Re-anchor, then orphan", "When a source moves, try exact quote, then prefix/suffix, then fuzzy. If all three fail the extract is orphaned, not deleted.", "human", 26),
  note(9, "Notebooks are join tables", "A notebook does not own files. The same source or activity can sit in many notebooks because membership is a reference, not a parent.", "ai_drafted", 24),
  note(10, "The note sits in the path", "Nothing should generate an activity from a source. The note is always in the path, so I am tested on my own words.", "human", 22),
  note(11, "Stale means drifted", "When I edit a note, activities from the old hash become stale. Regeneration is an offer. Stale is not the same as wrong.", "ai_edited", 20),
  note(12, "The product is the edit", "If I cannot point at a paragraph I rewrote before I was quizzed on it, this is a chatbot with extra steps. Origin and body_hash exist so that edit is visible.", "human", 18),
];

const quotes: { n: number; source: keyof typeof sourceMarkdown; exact: string; priority: number; by: SeedExtract["suggested_by"] }[] = [
  { n: 1, source: "fsrs", exact: "FSRS estimates retrievability from a memory model, not from an ease factor you twist by hand.", priority: 10, by: "nemotron" },
  { n: 2, source: "fsrs", exact: "The A-factor in SuperMemo is a per-item multiplier on the next interval. FSRS has no equivalent because difficulty and stability are already the model's explanation of why two cards behave differently.", priority: 15, by: "human" },
  { n: 3, source: "fsrs", exact: "If you compress wall-clock time without compressing the unit of a day, FSRS concludes you recalled the card far too early and inflates stability.", priority: 20, by: "nemotron" },
  { n: 4, source: "fsrs", exact: "Raising request_retention from 0.90 to 0.95 is the principled way to see cards more often. It shortens every interval because the model is targeting a higher chance of recall.", priority: 18, by: "nemotron" },
  { n: 5, source: "queue", exact: "A reading pile is a graveyard. A reading queue is a promise that the next thing you see is the most important unread span you have.", priority: 12, by: "human" },
  { n: 6, source: "queue", exact: "Priority is not importance in the abstract. It is a ranking of what should surface next, on a 0-100 scale where lower numbers float to the top.", priority: 22, by: "nemotron" },
  { n: 7, source: "queue", exact: "Extracts are not notes. An extract is a span you might want to remember; a note is the sentence you would say if you had to explain it tomorrow.", priority: 8, by: "human" },
  { n: 8, source: "queue", exact: "When the source moves, the highlight should try to find itself again: exact quote, then prefix and suffix, then fuzzy. If all three fail, it is orphaned, not deleted.", priority: 25, by: "nemotron" },
  { n: 9, source: "pivot", exact: "Nothing generates an activity directly from a source. The note is always in the path, so the user's own words are what gets tested.", priority: 5, by: "human" },
  { n: 10, source: "pivot", exact: "AI may draft a note from extracts, but the draft is a suggestion that sits in an editor. Committing it without a human pass is how you end up reviewing someone else's sentences.", priority: 14, by: "nemotron" },
  { n: 11, source: "pivot", exact: "When the note changes, downstream activities become stale. Regeneration is an offer, not a silent rewrite.", priority: 16, by: "nemotron" },
  { n: 12, source: "pivot", exact: "The product is the edit. If you cannot point at a paragraph the user rewrote before they were quizzed on it, you have built a chatbot with extra steps.", priority: 6, by: "human" },
];

export const extracts: SeedExtract[] = quotes.map((q) => {
  const markdown = sourceMarkdown[q.source];
  const sourceId =
    q.source === "fsrs" ? ids.source.fsrs : q.source === "queue" ? ids.source.queue : ids.source.pivot;
  return {
    id: ids.extract(q.n),
    source_id: sourceId,
    note_id: null,
    body_md: q.exact,
    priority: q.priority,
    selector: selectorFor(markdown, q.exact),
    anchor_status: "anchored",
    suggested_by: q.by,
    accepted: true,
    created_at: daysAgo(45 - q.n),
  };
});

export const extractNotes: { extract_id: string; note_id: string }[] = [
  [1, 1], [2, 1], [2, 2], [4, 3], [3, 4], [5, 5], [6, 6], [7, 7], [8, 8], [9, 10], [11, 11], [12, 12], [10, 12], [7, 10],
].map(([e, n]) => ({ extract_id: ids.extract(e), note_id: ids.note(n) }));

export const concepts: SeedConcept[] = [
  { id: ids.concept.fsrs, label: "FSRS" },
  { id: ids.concept.retrievability, label: "retrievability" },
  { id: ids.concept.aFactor, label: "A-factor" },
  { id: ids.concept.virtualClock, label: "virtual clock" },
  { id: ids.concept.incrementalReading, label: "incremental reading" },
  { id: ids.concept.extract, label: "extract" },
  { id: ids.concept.note, label: "note" },
  { id: ids.concept.anchoring, label: "anchoring" },
];

export const conceptNotes: { concept_id: string; note_id: string }[] = [
  [ids.concept.fsrs, 1], [ids.concept.retrievability, 1], [ids.concept.aFactor, 1],
  [ids.concept.aFactor, 2], [ids.concept.fsrs, 2],
  [ids.concept.retrievability, 3], [ids.concept.fsrs, 3],
  [ids.concept.virtualClock, 4], [ids.concept.fsrs, 4],
  [ids.concept.incrementalReading, 5],
  [ids.concept.incrementalReading, 6],
  [ids.concept.extract, 7], [ids.concept.note, 7],
  [ids.concept.anchoring, 8], [ids.concept.extract, 8],
  [ids.concept.incrementalReading, 9],
  [ids.concept.note, 10], [ids.concept.extract, 10],
  [ids.concept.note, 11],
  [ids.concept.note, 12],
].map(([c, n]) => ({ concept_id: c as string, note_id: ids.note(n as number) }));

export const conceptExtracts: { concept_id: string; extract_id: string }[] = [
  [ids.concept.fsrs, 1], [ids.concept.retrievability, 1],
  [ids.concept.aFactor, 2],
  [ids.concept.virtualClock, 3],
  [ids.concept.retrievability, 4],
  [ids.concept.incrementalReading, 5],
  [ids.concept.incrementalReading, 6],
  [ids.concept.extract, 7], [ids.concept.note, 7],
  [ids.concept.anchoring, 8],
  [ids.concept.note, 9],
  [ids.concept.note, 10],
  [ids.concept.note, 11],
  [ids.concept.note, 12],
].map(([c, e]) => ({ concept_id: c as string, extract_id: ids.extract(e as number) }));

function act(
  n: number,
  noteN: number,
  payload: ActivityPayload,
  stale = false,
): SeedActivity {
  const parent = notes[noteN - 1];
  return {
    id: ids.activity(n),
    note_id: parent.id,
    extract_id: null,
    type: payload.type,
    payload,
    source_body_hash: stale ? "stale-seed-hash" : parent.body_hash,
    variant_of: null,
    created_at: daysAgo(16 - (n % 12)),
  };
}

export const activities: SeedActivity[] = [
  act(1, 1, { type: "mcq", stem: "What does FSRS estimate retrievability from?", options: ["An ease factor the user twists", "A memory model of stability and difficulty", "The number of times you pressed Easy", "The length of the note"], answer: 1, explanation: "FSRS is a memory model, not an ease slider." }),
  act(2, 1, { type: "mcq", stem: "Which SuperMemo idea does FSRS refuse to put inside the model?", options: ["Priority", "The A-factor", "Mercy postpone", "Extracts"], answer: 1 }),
  act(3, 2, { type: "mcq", stem: "Where should an A-factor be applied?", options: ["By rewriting stability", "Before FSRS runs", "After FSRS chooses an interval", "On the source markdown"], answer: 2 }),
  act(4, 3, { type: "mcq", stem: "Raising request_retention from 0.90 to 0.95 will:", options: ["Lengthen every interval", "Shorten every interval", "Change only new cards", "Disable fuzz"], answer: 1 }),
  act(5, 4, { type: "mcq", stem: "Why is multiplying intervals down a bad demo trick?", options: ["It looks slow on stage", "FSRS thinks you recalled too early and inflates stability", "ts-fsrs cannot handle seconds", "Judges prefer Anki"], answer: 1 }),
  act(6, 5, { type: "mcq", stem: "What is the difference between a pile and a queue?", options: ["A pile is stored in Spaces", "A queue has a next item; a pile does not", "A pile is markdown", "A queue cannot contain PDFs"], answer: 1 }),
  act(7, 6, { type: "mcq", stem: "On the 0-100 priority scale, which items surface first?", options: ["Higher numbers", "Lower numbers", "Newest items", "Items with extracts"], answer: 1 }),
  act(8, 7, { type: "mcq", stem: "What should become a question?", options: ["The PDF page", "The extract span", "The note, in your own words", "The RSS title"], answer: 2 }),
  act(9, 8, { type: "mcq", stem: "If exact, prefix/suffix, and fuzzy re-anchor all fail, the extract is:", options: ["Deleted", "Detached", "Orphaned", "Pending"], answer: 2 }),
  act(10, 10, { type: "mcq", stem: "Why must activities be generated from notes, not sources?", options: ["Sources are too long", "So the user's own words are what gets tested", "Nemotron cannot read PDFs", "FSRS requires markdown"], answer: 1 }),
  act(11, 11, { type: "mcq", stem: "A stale activity means:", options: ["You failed it twice", "The note body hash no longer matches", "The extract was orphaned", "The scheduler profile changed"], answer: 1 }),
  act(12, 12, { type: "mcq", stem: "What is the product, if this is not a chatbot wrapper?", options: ["The transcript", "The edit you make to an AI-drafted note", "The embedding index", "The PWA manifest"], answer: 1 }),

  act(13, 1, { type: "select_all", stem: "Which variables does FSRS track per card?", options: ["Stability", "Difficulty", "A-factor", "Retrievability target"], answers: [0, 1], explanation: "A-factor is our overlay. Retention is a profile setting, not per card." }),
  act(14, 2, { type: "select_all", stem: "A legitimate scheduler override should:", options: ["Multiply the output interval", "Live beside the card", "Be written into stability", "Stay between 0.1 and 5.0"], answers: [0, 1, 3] }),
  act(15, 4, { type: "select_all", stem: "A correct virtual clock must:", options: ["Scale time into ts-fsrs", "Scale time back before persisting due", "Leave elapsed_days in wall-clock while shrinking intervals", "Keep due comparable to now()"], answers: [0, 1, 3] }),
  act(16, 7, { type: "select_all", stem: "Which statements are true?", options: ["Extracts are spans", "Notes are claims in your words", "Activities should come from extracts", "Highlights rot if you never distill"], answers: [0, 1, 3] }),
  act(17, 8, { type: "select_all", stem: "The re-anchor ladder tries, in order:", options: ["Exact quote", "Prefix and suffix", "Fuzzy match", "pdf.js text layer offsets"], answers: [0, 1, 2] }),
  act(18, 9, { type: "select_all", stem: "Because notebooks are join tables:", options: ["One source can appear in many notebooks", "Deleting a notebook deletes the source", "Library can list global items", "Membership is not ownership"], answers: [0, 2, 3] }),
  act(19, 10, { type: "select_all", stem: "What belongs on the path from reading to review?", options: ["Source markdown", "Extract", "Note", "Activity"], answers: [0, 1, 2, 3] }),
  act(20, 11, { type: "select_all", stem: "When a note is edited you should:", options: ["Mark matching activities stale", "Silently rewrite the questions", "Offer regeneration", "Keep the old question if you want"], answers: [0, 2, 3] }),
  act(21, 5, { type: "select_all", stem: "A reading queue should:", options: ["Have a next item", "Rank spans, not whole documents", "Treat unread PDFs as equally urgent", "Let leftover text wait at its priority"], answers: [0, 1, 3] }),
  act(22, 12, { type: "select_all", stem: "Evidence that a human intervened includes:", options: ["origin = human or ai_edited", "A body_hash that activities can drift from", "A chat transcript", "A rewritten paragraph in the editor"], answers: [0, 1, 3] }),

  act(23, 1, { type: "fill_blank", template: "FSRS schedules the next due date so that {{1}} at that date matches the {{2}} you asked for.", blanks: [{ id: 1, accepted: ["retrievability"], hint: "chance of recall" }, { id: 2, accepted: ["retention", "request retention", "request_retention"] }] }),
  act(24, 2, { type: "fill_blank", template: "Store an A-factor beside the card and apply it {{1}} FSRS speaks.", blanks: [{ id: 1, accepted: ["after"] }] }),
  act(25, 3, { type: "fill_blank", template: "Raising request_retention from 0.90 to {{1}} shortens every interval.", blanks: [{ id: 1, accepted: ["0.95", ".95"] }] }),
  act(26, 4, { type: "fill_blank", template: "Demo mode should redefine the unit of a {{1}} symmetrically, not shrink intervals in wall-clock time.", blanks: [{ id: 1, accepted: ["day"] }] }),
  act(27, 6, { type: "fill_blank", template: "Priority is a 0-100 ranking where {{1}} numbers float to the top.", blanks: [{ id: 1, accepted: ["lower", "low", "smaller"] }] }),
  act(28, 7, { type: "fill_blank", template: "An {{1}} is a span; a {{2}} is the sentence you would say tomorrow.", blanks: [{ id: 1, accepted: ["extract"] }, { id: 2, accepted: ["note"] }] }),
  act(29, 8, { type: "fill_blank", template: "If the re-anchor ladder fails, the extract is {{1}}, not deleted.", blanks: [{ id: 1, accepted: ["orphaned", "orphan"] }] }),
  act(30, 10, { type: "fill_blank", template: "The {{1}} is always in the path between source and activity.", blanks: [{ id: 1, accepted: ["note"] }] }),
  act(31, 11, { type: "fill_blank", template: "Activities store source_body_hash so a note edit can mark them {{1}}.", blanks: [{ id: 1, accepted: ["stale"] }] }),
  act(32, 12, { type: "fill_blank", template: "If you cannot point at a paragraph the user {{1}} before the quiz, you have built a chatbot.", blanks: [{ id: 1, accepted: ["rewrote", "edited", "rewritten"] }] }),

  act(33, 1, { type: "closed", stem: "Name the two latent variables FSRS tracks per card.", answer: "stability and difficulty", accepted: ["difficulty and stability", "stability, difficulty"] }),
  act(34, 4, { type: "closed", stem: "In one sentence, what should demo mode change instead of shrinking intervals?", answer: "the unit of a day", accepted: ["the clock", "the length of a day", "day_ms", "virtual time"] }),
  act(35, 5, { type: "closed", stem: "What does a reading queue promise about the next item?", answer: "it is the most important unread span", accepted: ["the most important unread span", "the next most important unread span"] }),
  act(36, 7, { type: "closed", stem: "Why shouldn't a system turn a PDF into flashcards with no note in between?", answer: "it tests the author's phrasing, not your understanding", accepted: ["it tests the author's words", "it tests the source, not you"] }),
  act(37, 9, { type: "closed", stem: "What kind of table makes a notebook a collection of references rather than a folder?", answer: "a join table", accepted: ["join table", "membership table", "notebook_item"] }),
  act(38, 10, { type: "closed", stem: "Whose words should activities test?", answer: "the user's", accepted: ["your own", "the user's own words", "mine"] }),
  act(39, 11, { type: "closed", stem: "Is a stale activity necessarily wrong?", answer: "no", accepted: ["no, it drifted", "not necessarily"] }, true),
  act(40, 12, { type: "closed", stem: "What origin values record whether a human touched the note?", answer: "human, ai_drafted, ai_edited", accepted: ["human / ai_drafted / ai_edited"] }, true),
];

export const schedulerProfile = {
  id: ids.profile,
  name: "Default",
  request_retention: 0.9,
  maximum_interval: 36500,
  learning_steps: ["1m", "10m"],
  relearning_steps: ["10m"],
  enable_fuzz: true,
  interval_modifier: 1.0,
  day_ms: 86_400_000,
  created_at: daysAgo(80),
};

export const schedules: SeedSchedule[] = activities.map((activity, i) => {
  const dueOffsetHours =
    i < 8 ? -(2 + i) : i < 14 ? (i - 8) * 0.5 : 24 * (i - 10);
  const due = new Date(SEED_NOW.getTime() + dueOffsetHours * 3_600_000);
  const reviewed = i >= 8;
  return {
    activity_id: activity.id,
    due: due.toISOString(),
    stability: reviewed ? 1.2 + (i % 7) * 0.4 : 0,
    difficulty: 4.5 - (i % 5) * 0.3,
    elapsed_days: reviewed ? 1 + (i % 6) : 0,
    scheduled_days: reviewed ? 1 + (i % 8) : 0,
    learning_steps: reviewed ? 0 : i % 2,
    reps: reviewed ? 2 + (i % 9) : 0,
    lapses: i % 11 === 0 ? 1 : 0,
    state: reviewed ? 2 : i % 2,
    last_review: reviewed ? daysAgo(i % 12) : null,
    a_factor: i === 4 ? 0.5 : i === 16 ? 2 : 1,
  };
});

export const quizsets = [
  { id: ids.quizset.intro, name: "First session", kind: "flashcards" as const, created_at: daysAgo(10) },
  { id: ids.quizset.quiz, name: "Notes vs extracts", kind: "quiz" as const, created_at: daysAgo(8) },
];

export const quizsetActivities = [
  ...[1, 6, 8, 10, 12, 28, 33].map((n, i) => ({ quizset_id: ids.quizset.intro, activity_id: ids.activity(n), position: i })),
  ...[7, 8, 10, 16, 19, 36].map((n, i) => ({ quizset_id: ids.quizset.quiz, activity_id: ids.activity(n), position: i })),
];

const fsrsNoteNs = [1, 2, 3, 4];
const irNoteNs = [5, 6, 7, 8, 9, 10, 11, 12];
const fsrsExtractNs = [1, 2, 3, 4];
const irExtractNs = [5, 6, 7, 8, 9, 10, 11, 12];

function itemsFor(
  notebookId: string,
  sourceIds: string[],
  noteNs: number[],
  extractNs: number[],
  activityFilter: (a: SeedActivity) => boolean,
): SeedNotebookItem[] {
  const added = daysAgo(12);
  return [
    ...sourceIds.map((item_id) => ({ notebook_id: notebookId, item_type: "source" as const, item_id, added_at: added })),
    ...noteNs.map((n) => ({ notebook_id: notebookId, item_type: "note" as const, item_id: ids.note(n), added_at: added })),
    ...extractNs.map((n) => ({ notebook_id: notebookId, item_type: "extract" as const, item_id: ids.extract(n), added_at: added })),
    ...activities.filter(activityFilter).map((a) => ({ notebook_id: notebookId, item_type: "activity" as const, item_id: a.id, added_at: added })),
  ];
}

export const notebookItems: SeedNotebookItem[] = [
  ...itemsFor(
    ids.notebook.fsrs,
    [ids.source.fsrs],
    fsrsNoteNs,
    fsrsExtractNs,
    (a) => fsrsNoteNs.some((n) => a.note_id === ids.note(n)),
  ),
  ...itemsFor(
    ids.notebook.ir,
    [ids.source.queue, ids.source.pivot],
    irNoteNs,
    irExtractNs,
    (a) => irNoteNs.some((n) => a.note_id === ids.note(n)),
  ),
  // Shared across notebooks: the pivot source and the "product is the edit" note.
  {
    notebook_id: ids.notebook.fsrs,
    item_type: "note",
    item_id: ids.note(12),
    added_at: daysAgo(11),
  },
  {
    notebook_id: ids.notebook.fsrs,
    item_type: "source",
    item_id: ids.source.pivot,
    added_at: daysAgo(11),
  },
];
