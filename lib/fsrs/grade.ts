/**
 * Answer checking, one function per activity type.
 *
 * Pure and server-side. The client never decides whether it was right: it posts
 * the response and is told. That keeps the answer key out of the page payload
 * for auto-graded types and means voice and quiz modes grade identically.
 */
import type {
  ActivityPayload,
  ActivityResponse,
  Rating,
} from "@/lib/contracts/activity";

/**
 * Case- and whitespace-insensitive, and blind to the punctuation people drop.
 *
 * Whitespace is collapsed before terminal punctuation is stripped, because
 * `"Retrievability. "` ends in a space and would otherwise keep its full stop
 * and fail to match `"retrievability"`.
 */
function canonical(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.,;:!?]+$/, "");
}

function matchesAny(answer: string, accepted: string[]): boolean {
  const got = canonical(answer);
  return got.length > 0 && accepted.some((a) => canonical(a) === got);
}

const sameSet = (a: number[], b: number[]) =>
  a.length === b.length && [...a].sort().join() === [...b].sort().join();

export type Graded = {
  correct: boolean;
  /**
   * Rating to use when the client did not send one. Deliberately binary:
   * Again or Good. Hard and Easy are judgements only the reviewer can make, so
   * guessing them from a multiple-choice click would feed FSRS invented data.
   */
  suggested: Rating;
  /** Shown after answering, so the reviewer learns rather than just scores. */
  explanation?: string;
};

export function gradeResponse(
  payload: ActivityPayload,
  response: ActivityResponse,
): Graded {
  const correct = isCorrect(payload, response);
  return {
    correct,
    suggested: correct ? 3 : 1,
    explanation: explanationFor(payload),
  };
}

function isCorrect(
  payload: ActivityPayload,
  response: ActivityResponse,
): boolean {
  // The discriminated unions are independent, so a malformed pair is a
  // mismatch rather than a crash.
  if (payload.type !== response.type) return false;

  switch (payload.type) {
    case "mcq":
      return (
        response.type === "mcq" && response.choice === payload.answer
      );

    case "select_all":
      return (
        response.type === "select_all" &&
        sameSet(response.choices, payload.answers)
      );

    case "fill_blank": {
      if (response.type !== "fill_blank") return false;
      return payload.blanks.every((blank) =>
        matchesAny(response.filled[String(blank.id)] ?? "", blank.accepted),
      );
    }

    case "closed":
      return (
        response.type === "closed" &&
        matchesAny(response.text, [payload.answer, ...payload.accepted])
      );
  }
}

function explanationFor(payload: ActivityPayload): string | undefined {
  if (payload.type === "mcq" || payload.type === "select_all") {
    return payload.explanation;
  }
  return undefined;
}

/**
 * `closed` is the flashcard: there is no reliable way to score a sentence, so
 * the reviewer self-rates after revealing. The text match still runs, but only
 * to suggest a button rather than to decide the rating.
 */
export function isSelfRated(type: ActivityPayload["type"]): boolean {
  return type === "closed";
}
