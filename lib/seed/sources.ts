import { normalizeMarkdown, wordCount } from "../contracts/markdown";

const FSRS_MD = `# FSRS without an A-factor

Spaced repetition software spent two decades letting users twist an ease factor until the queue felt right. SuperMemo called that number the A-factor. Anki called it ease. Both are a single float that stretches or shrinks the next interval after you press Good.

FSRS estimates retrievability from a memory model, not from an ease factor you twist by hand.

The model tracks two latent variables per card: stability (how long retrievability takes to fall from 100% to 90%) and difficulty (how hard the item is to learn). When you grade a review, FSRS updates both, then schedules the next due date so that retrievability at that date matches the retention you asked for.

The A-factor in SuperMemo is a per-item multiplier on the next interval. FSRS has no equivalent because difficulty and stability are already the model's explanation of why two cards behave differently.

That does not mean you should never override the scheduler. It means the override should be an honest multiplier on the output interval, not a hidden rewrite of the memory state. Call it an A-factor if you want the SuperMemo muscle memory, but store it beside the card, apply it after FSRS speaks, and never feed the scaled interval back into stability.

Request retention is the other legitimate knob. Raising request_retention from 0.90 to 0.95 is the principled way to see cards more often. It shortens every interval because the model is targeting a higher chance of recall.

Demo mode is where teams usually cheat. The naive approach is to multiply intervals down so cards return in seconds. If you compress wall-clock time without compressing the unit of a day, FSRS concludes you recalled the card far too early and inflates stability. The diagnostics screen then shows nonsense: a card you have known for two minutes reports a stability of months.

The fix is symmetric. Redefine the unit of a day in both directions. ts-fsrs sees a faster world; everything you persist stays in real time. You have not faked the schedule. You have changed the clock.

Three presets cover a product, a demo, and a talk: a real day, a one-second day, and a one-minute day. Say out loud which one is on. Judges notice when the numbers still make sense.
`;

const QUEUE_MD = `# Incremental reading is a queue

Most people who try to read on the internet build a pile. Pocket, a downloads folder, a dozen tabs named "read later". A pile has no next item. It only has guilt.

A reading pile is a graveyard. A reading queue is a promise that the next thing you see is the most important unread span you have.

Priority is not importance in the abstract. It is a ranking of what should surface next, on a 0-100 scale where lower numbers float to the top.

The unit of work is not the document. It is a span. You open a source, you read until something is worth keeping, you extract that span, and you go back to the queue. The rest of the document waits at the priority you left it.

Extracts are not notes. An extract is a span you might want to remember; a note is the sentence you would say if you had to explain it tomorrow.

That distinction is the whole product. Highlights are cheap and they rot. A note is a claim in your own words, and only claims should become questions. If a system turns a PDF into flashcards without a note in between, it is testing the author's phrasing, not your understanding.

Anchoring is how an extract stays honest. Store the exact quote plus a short prefix and suffix and the character offsets in the normalized markdown. When the source moves, the highlight should try to find itself again: exact quote, then prefix and suffix, then fuzzy. If all three fail, it is orphaned, not deleted.

Orphans are not a failure of the user. They are a failure of the file to stay still. Detach them when you mean to keep the text without the location. Re-anchor them when you have a new source. Do not silently drop them.

A notebook is not a folder that owns files. It is a saved collection of references. The same source, the same note, and the same activity can appear in many notebooks, because membership is a join table, not a parent pointer.

Read a little. Extract a little. Distill. Then let the queue decide what is next. That is incremental reading. Everything else is a to-read list with better typography.
`;

const PIVOT_MD = `# The note is the pivot

Passive reading produces extracts. Active recall consumes activities. Between them sits a markdown note, and that is the only place the human is required.

Nothing generates an activity directly from a source. The note is always in the path, so the user's own words are what gets tested.

This is also the answer to "is this just an AI wrapper?". A wrapper emits a transcript. A reading tool emits an artifact you can rewrite. AI may draft a note from extracts, but the draft is a suggestion that sits in an editor. Committing it without a human pass is how you end up reviewing someone else's sentences.

The edit is visible. Origin is recorded as human, ai_drafted, or ai_edited, and a hash of the body travels with every activity generated from it. When the note changes, downstream activities become stale. Regeneration is an offer, not a silent rewrite.

Stale does not mean wrong. It means the question no longer matches the claim you currently believe. You might keep the old question on purpose. You should never be surprised that it drifted.

Concepts tag notes and extracts so diagnostics can say what you know, what you are struggling with, and what you have not touched. They are labels, not a second knowledge graph. If a concept has no reviews, it is untouched, not unknown.

The product is the edit. If you cannot point at a paragraph the user rewrote before they were quizzed on it, you have built a chatbot with extra steps.

Keep the original PDF if you want a side-by-side later. Do not let anything downstream of ingest see it. Markdown is the only input the rest of the app is allowed to know about, which is the only reason four people can build this in a weekend without arguing about pdf.js offsets.
`;

export const sourceMarkdown = {
  fsrs: normalizeMarkdown(FSRS_MD),
  queue: normalizeMarkdown(QUEUE_MD),
  pivot: normalizeMarkdown(PIVOT_MD),
};

export const sourceWordCounts = {
  fsrs: wordCount(sourceMarkdown.fsrs),
  queue: wordCount(sourceMarkdown.queue),
  pivot: wordCount(sourceMarkdown.pivot),
};
