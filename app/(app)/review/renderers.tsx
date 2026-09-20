"use client";

/**
 * One renderer per activity type. Each owns its own answer state and reports a
 * `ActivityResponse` upward; none of them knows the correct answer, which
 * arrives only after the reveal.
 */
import { useEffect, useMemo, useRef } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ActivityPayload, ActivityResponse } from "@/lib/contracts/activity";

/** The queue strips answer keys, so the client only ever sees these shapes. */
export type Prompt =
  | { type: "mcq"; stem: string; options: string[] }
  | { type: "select_all"; stem: string; options: string[] }
  | {
      type: "fill_blank";
      template: string;
      blanks: { id: number; hint?: string }[];
    }
  | { type: "closed"; stem: string; hint?: string };

export type Draft =
  | { type: "mcq"; choice: number | null }
  | { type: "select_all"; choices: number[] }
  | { type: "fill_blank"; filled: Record<string, string> }
  | { type: "closed"; text: string };

export function emptyDraft(prompt: Prompt): Draft {
  switch (prompt.type) {
    case "mcq":
      return { type: "mcq", choice: null };
    case "select_all":
      return { type: "select_all", choices: [] };
    case "fill_blank":
      return { type: "fill_blank", filled: {} };
    case "closed":
      return { type: "closed", text: "" };
  }
}

/** `closed` may be submitted blank: not recalling is itself an answer. */
export function isAnswered(draft: Draft): boolean {
  switch (draft.type) {
    case "mcq":
      return draft.choice !== null;
    case "select_all":
      return draft.choices.length > 0;
    case "fill_blank":
      return Object.values(draft.filled).some((v) => v.trim().length > 0);
    case "closed":
      return true;
  }
}

export function toResponse(draft: Draft): ActivityResponse {
  switch (draft.type) {
    case "mcq":
      return { type: "mcq", choice: draft.choice ?? -1 };
    case "select_all":
      return { type: "select_all", choices: draft.choices };
    case "fill_blank":
      return { type: "fill_blank", filled: draft.filled };
    case "closed":
      return { type: "closed", text: draft.text };
  }
}

type RendererProps = {
  prompt: Prompt;
  draft: Draft;
  onChange: (draft: Draft) => void;
  /** After reveal the inputs lock and the answer key paints over them. */
  revealed: ActivityPayload | null;
  onSubmit: () => void;
};

export function QuestionBody(props: RendererProps) {
  switch (props.prompt.type) {
    case "mcq":
    case "select_all":
      return <ChoiceQuestion {...props} />;
    case "fill_blank":
      return <FillBlankQuestion {...props} />;
    case "closed":
      return <ClosedQuestion {...props} />;
  }
}

/**
 * MCQ and select-all differ only in arity, so they share a renderer. Keeping
 * them together is what makes supporting select-all nearly free.
 */
function ChoiceQuestion({ prompt, draft, onChange, revealed }: RendererProps) {
  const correct = useMemo(() => {
    if (!revealed) return null;
    if (revealed.type === "mcq") return new Set([revealed.answer]);
    if (revealed.type === "select_all") return new Set(revealed.answers);
    return null;
  }, [revealed]);

  if (prompt.type !== "mcq" && prompt.type !== "select_all") return null;
  const multi = prompt.type === "select_all";

  const picked = (index: number) =>
    draft.type === "mcq"
      ? draft.choice === index
      : draft.type === "select_all"
        ? draft.choices.includes(index)
        : false;

  function toggle(index: number) {
    if (revealed) return;
    if (!multi) {
      onChange({ type: "mcq", choice: index });
      return;
    }
    const current = draft.type === "select_all" ? draft.choices : [];
    onChange({
      type: "select_all",
      choices: current.includes(index)
        ? current.filter((i) => i !== index)
        : [...current, index],
    });
  }

  return (
    <div className="space-y-3">
      <p className="font-serif text-xl leading-snug">{prompt.stem}</p>
      {multi ? (
        <p className="text-xs text-muted-foreground">
          Select every correct option.
        </p>
      ) : null}
      <ul className="space-y-2">
        {prompt.options.map((option, index) => {
          const isPicked = picked(index);
          const isCorrect = correct?.has(index) ?? false;
          return (
            <li key={option}>
              <button
                type="button"
                disabled={Boolean(revealed)}
                onClick={() => toggle(index)}
                className={cn(
                  "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                  !revealed && "hover:bg-accent",
                  !revealed && isPicked && "border-primary bg-accent",
                  revealed && isCorrect && "border-success bg-success/10",
                  revealed &&
                    isPicked &&
                    !isCorrect &&
                    "border-destructive bg-destructive/10",
                  revealed && !isCorrect && !isPicked && "opacity-60",
                )}
              >
                <kbd className="grid size-5 shrink-0 place-items-center rounded border bg-muted font-mono text-[10px]">
                  {index + 1}
                </kbd>
                <span className="min-w-0 flex-1">{option}</span>
                {revealed && isCorrect ? (
                  <Badge className="bg-success text-background">correct</Badge>
                ) : null}
                {revealed && isPicked && !isCorrect ? (
                  <Badge variant="destructive">you</Badge>
                ) : null}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The cloze. `{{1}}` markers in the template become inputs inline, so the
 * sentence still reads as a sentence while you fill it.
 */
function FillBlankQuestion({
  prompt,
  draft,
  onChange,
  revealed,
  onSubmit,
}: RendererProps) {
  const expected = useMemo(() => {
    if (revealed?.type !== "fill_blank") return null;
    return new Map(revealed.blanks.map((b) => [String(b.id), b.accepted]));
  }, [revealed]);

  const template = prompt.type === "fill_blank" ? prompt.template : "";
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!revealed) first.current?.focus();
  }, [revealed, template]);

  if (prompt.type !== "fill_blank") return null;
  const filled = draft.type === "fill_blank" ? draft.filled : {};

  // Split on the markers but keep them, so text and blanks stay interleaved.
  const parts = template.split(/(\{\{\d+\}\})/g).filter(Boolean);
  const firstBlankId = prompt.blanks[0] ? String(prompt.blanks[0].id) : null;

  return (
    <div className="space-y-3">
      <p className="font-serif text-xl leading-loose">
        {parts.map((part, index) => {
          const marker = /^\{\{(\d+)\}\}$/.exec(part);
          if (!marker) return <span key={index}>{part}</span>;

          const id = marker[1];
          const blank = prompt.blanks.find((b) => String(b.id) === id);
          const accepted = expected?.get(id);
          const value = filled[id] ?? "";
          const right =
            accepted?.some(
              (a) => a.trim().toLowerCase() === value.trim().toLowerCase(),
            ) ?? false;

          return (
            <span key={index} className="mx-1 inline-flex flex-col align-baseline">
              <Input
                ref={id === firstBlankId ? first : undefined}
                value={value}
                disabled={Boolean(revealed)}
                placeholder={blank?.hint ?? `blank ${id}`}
                onChange={(event) =>
                  onChange({
                    type: "fill_blank",
                    filled: { ...filled, [id]: event.target.value },
                  })
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onSubmit();
                  }
                }}
                className={cn(
                  "inline-block h-8 w-40 font-sans text-sm",
                  revealed && right && "border-success bg-success/10",
                  revealed && !right && "border-destructive bg-destructive/10",
                )}
              />
              {revealed && !right && accepted ? (
                <span className="mt-0.5 font-sans text-xs text-success">
                  {accepted[0]}
                </span>
              ) : null}
            </span>
          );
        })}
      </p>
    </div>
  );
}

/**
 * The flashcard. Free text cannot be scored reliably, so the typed answer is
 * only a prompt for honesty — the reviewer rates themselves after the reveal.
 */
function ClosedQuestion({
  prompt,
  draft,
  onChange,
  revealed,
  onSubmit,
}: RendererProps) {
  const stem = prompt.type === "closed" ? prompt.stem : "";
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!revealed) input.current?.focus();
  }, [revealed, stem]);

  if (prompt.type !== "closed") return null;
  const text = draft.type === "closed" ? draft.text : "";

  return (
    <div className="space-y-3">
      <p className="font-serif text-xl leading-snug">{prompt.stem}</p>
      <Input
        ref={input}
        value={text}
        disabled={Boolean(revealed)}
        placeholder={prompt.hint ?? "Say it in your own words, then reveal"}
        onChange={(event) => onChange({ type: "closed", text: event.target.value })}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
        }}
      />
      {revealed?.type === "closed" ? (
        <div className="rounded-lg border border-success/40 bg-success/10 px-3 py-2">
          <p className="text-xs font-medium text-muted-foreground">Answer</p>
          <p className="font-serif text-lg">{revealed.answer}</p>
        </div>
      ) : null}
    </div>
  );
}
