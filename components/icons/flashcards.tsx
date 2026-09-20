import type { SVGProps } from "react";

/**
 * Three stacked cards with a prompt dot and an answer line on the face.
 *
 * Lucide has no flashcard glyph and its nearest stand-in, WalletCards, reads as
 * a stack of envelopes. This is drawn on lucide's grid — 24x24, 2px round
 * strokes, no fill — so it sits at the same weight as the icons beside it.
 */
export function Flashcards(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {/* The two cards behind are open corners rather than whole rectangles;
          a full outline turns to mush once the icon is drawn at 16px. */}
      <path d="M10 3h8a2.5 2.5 0 0 1 2.5 2.5V13" />
      <path d="M7 5.5h8.5a2.5 2.5 0 0 1 2.5 2.5v7.5" />
      <rect x="2" y="8" width="13.5" height="12.5" rx="2.5" />
      <circle cx="6.1" cy="12.2" r="1.15" />
      <path d="M5.6 16.4h6.5" />
    </svg>
  );
}
