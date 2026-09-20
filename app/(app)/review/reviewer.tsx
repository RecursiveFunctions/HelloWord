"use client";

/**
 * The review session.
 *
 * It runs until the queue is empty or you navigate away. "Empty" is decided by
 * the server, not the local list: under a compressed clock a card you just
 * failed is due again within seconds, so draining the local queue triggers a
 * refetch and only a server that reports nothing due ends the session.
 *
 * Per-card state lives in `CardSession`, keyed by activity id. Remounting on
 * every card is what clears the draft answer, rather than an effect that
 * watches for the card changing.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { ClockPresets } from "@/components/clock-presets";
import { resolveNotebookColor } from "@/lib/themes";
import { cn } from "@/lib/utils";
import type { ClientCard } from "@/lib/fsrs/queue";
import type { ActivityPayload, Rating } from "@/lib/contracts/activity";
import {
  emptyDraft,
  isAnswered,
  QuestionBody,
  toResponse,
  type Draft,
} from "./renderers";

type Counts = { total: number; byNotebook: Record<string, number> };

type Snapshot = {
  cards: ClientCard[];
  counts: Counts;
  clockOffsetMs: number;
  now: string;
  nextDue: string | null;
};

/** "3s", "12m", "4d" — mirrors the server-side helper for client-only copy. */
function humanize(ms: number): string {
  const v = Math.max(0, ms);
  if (v < 60_000) return `${Math.max(1, Math.round(v / 1000))}s`;
  if (v < 3_600_000) return `${Math.round(v / 60_000)}m`;
  if (v < 86_400_000) return `${Math.round(v / 3_600_000)}h`;
  const days = Math.round(v / 86_400_000);
  if (days < 31) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

type Checked = {
  correct: boolean;
  suggested: Rating;
  selfRated: boolean;
  expected: ActivityPayload;
  explanation?: string;
  intervals: Record<number, string>;
};

const RATINGS: { value: Rating; label: string }[] = [
  { value: 1, label: "Again" },
  { value: 2, label: "Hard" },
  { value: 3, label: "Good" },
  { value: 4, label: "Easy" },
];

const STATE_LABEL = ["new", "learning", "review", "relearning"];

const HINTS: Record<ClientCard["type"], string> = {
  mcq: "Digits pick an option. Enter to check.",
  select_all: "Digits toggle options. Enter to check.",
  fill_blank: "Fill every blank. Enter to check.",
  closed: "Answer in your head, then reveal. Enter.",
};

/** `null` is everything; an empty array is an explicit nothing. */
type Selection = string[] | null;

async function fetchQueue(selection: Selection) {
  const params = new URLSearchParams();
  if (selection?.length === 0) params.set("scope", "none");
  else for (const id of selection ?? []) params.append("notebookId", id);

  const query = params.toString();
  const res = await fetch(`/api/review/queue${query ? `?${query}` : ""}`, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Queue request failed (${res.status})`);
  return (await res.json()) as Snapshot;
}

export function Reviewer({
  notebooks,
  initialSnapshot,
  initialSelection,
  initialDayMs,
}: {
  notebooks: { id: string; name: string; color: string | null }[];
  initialSnapshot: Snapshot;
  initialSelection: Selection;
  initialDayMs: number;
}) {
  const [selection, setSelection] = useState<Selection>(initialSelection);
  const [queue, setQueue] = useState(initialSnapshot.cards);
  const [counts, setCounts] = useState(initialSnapshot.counts);
  const [nextDue, setNextDue] = useState(initialSnapshot.nextDue);
  const [serverNow, setServerNow] = useState(initialSnapshot.now);
  const [offsetMs, setOffsetMs] = useState(initialSnapshot.clockOffsetMs);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [lapsed, setLapsed] = useState(0);
  const [pending, startTransition] = useTransition();
  const [skipping, setSkipping] = useState(false);

  const current = queue[0];
  const allIds = notebooks.map((n) => n.id);
  const isOn = (id: string) => selection === null || selection.includes(id);
  const nothingSelected = selection?.length === 0;

  const refill = useCallback(async (next: Selection) => {
    try {
      const body = await fetchQueue(next);
      setQueue(body.cards);
      setCounts(body.counts);
      setNextDue(body.nextDue);
      setServerNow(body.now);
      setOffsetMs(body.clockOffsetMs);
      setError(null);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not load the queue.",
      );
    }
  }, []);

  /**
   * Move the clock to the next card instead of the card to the clock. Under the
   * Normal preset a cleared queue can mean "tomorrow", and a button beats
   * staring at an empty screen wondering whether the app is broken.
   */
  const skipAhead = useCallback(
    async (reset = false) => {
      setSkipping(true);
      try {
        const res = await fetch("/api/review/skip", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ notebookIds: selection ?? undefined, reset }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? `Skip failed (${res.status})`);
        }
        await refill(selection);
      } catch (cause) {
        setError(
          cause instanceof Error ? cause.message : "Could not skip ahead.",
        );
      } finally {
        setSkipping(false);
      }
    },
    [selection, refill],
  );

  function switchScope(next: Selection) {
    // Every notebook ticked is the same intent as Everything, and collapsing to
    // `null` also picks up any activity that is not filed in a notebook yet.
    const normalized =
      next !== null && allIds.every((id) => next.includes(id)) ? null : next;

    setSelection(normalized);
    setQueue([]);
    startTransition(async () => {
      await refill(normalized);
    });
  }

  /** Toggling from Everything means "all of them except this one". */
  function toggle(id: string) {
    const base = selection ?? allIds;
    switchScope(
      base.includes(id) ? base.filter((x) => x !== id) : [...base, id],
    );
  }

  /**
   * Nothing due locally is not the same as nothing due. Poll while the queue
   * looks empty so a card that comes back mid-session reappears on its own;
   * under the Demo clock that is a second or two.
   */
  useEffect(() => {
    if (queue.length > 0 || pending || nothingSelected) return;
    const timer = setTimeout(() => {
      void refill(selection);
    }, 2000);
    return () => clearTimeout(timer);
  }, [queue.length, pending, nothingSelected, selection, refill]);

  const advance = useCallback((rating: Rating) => {
    setDone((n) => n + 1);
    if (rating === 1) setLapsed((n) => n + 1);
    setQueue((rest) => rest.slice(1));
  }, []);

  const scopeName =
    selection === null
      ? "everything"
      : selection.length === 0
        ? "nothing"
        : selection.length === 1
          ? (notebooks.find((n) => n.id === selection[0])?.name ?? "notebook")
          : `${selection.length} notebooks`;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <ClockPresets
          dayMs={initialDayMs}
          onChanged={() => void refill(selection)}
        />
        <p className="text-xs text-muted-foreground">
          Intervals below each rating are real time. Demo makes one FSRS day one
          second, so a card you fail returns while you are still here.
        </p>
      </div>

      {offsetMs > 0 ? (
        <p className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-3 py-2 text-sm">
          <span>
            Clock skipped <strong>{humanize(offsetMs)}</strong> ahead of real
            time. Schedules are untouched.
          </span>
          <button
            type="button"
            disabled={skipping}
            onClick={() => void skipAhead(true)}
            className="underline underline-offset-2 disabled:opacity-50"
          >
            Back to now
          </button>
        </p>
      ) : null}

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          {notebooks.map((notebook) => (
            <Chip
              key={notebook.id}
              active={isOn(notebook.id)}
              count={counts.byNotebook[notebook.id] ?? 0}
              color={
                notebook.color ? resolveNotebookColor(notebook.color) : null
              }
              onClick={() => toggle(notebook.id)}
            >
              {notebook.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <button
            type="button"
            onClick={() => switchScope(null)}
            disabled={selection === null}
            className="underline underline-offset-2 disabled:no-underline disabled:opacity-50"
          >
            Everything
          </button>
          <button
            type="button"
            onClick={() => switchScope([])}
            disabled={nothingSelected}
            className="underline underline-offset-2 disabled:no-underline disabled:opacity-50"
          >
            Nothing
          </button>
          <span className="text-muted-foreground">
            {selection === null
              ? `all ${counts.total} due`
              : `drawing from ${scopeName}`}
          </span>
          <span className="ml-auto text-sm text-muted-foreground">
            {done} reviewed{lapsed > 0 ? ` · ${lapsed} again` : ""}
          </span>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm">
          {error}
        </p>
      ) : null}

      {pending ? (
        <p className="text-sm text-muted-foreground">Loading the queue…</p>
      ) : nothingSelected ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center">
          <p className="font-heading text-xl">No notebooks selected</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Turn one on above, or pick Everything.
          </p>
        </div>
      ) : !current ? (
        <QueueClear
          scope={scopeName}
          done={done}
          nextDue={nextDue}
          now={serverNow}
          skipping={skipping}
          onSkip={() => void skipAhead()}
        />
      ) : (
        <CardSession
          key={current.activityId}
          card={current}
          remaining={queue.length}
          scopeName={scopeName}
          onGraded={advance}
          onError={setError}
        />
      )}
    </div>
  );
}

/**
 * One card, from blank to graded. Owning the draft here means the parent never
 * has to reset it: a new activity id is a new component.
 */
function CardSession({
  card,
  remaining,
  scopeName,
  onGraded,
  onError,
}: {
  card: ClientCard;
  remaining: number;
  scopeName: string;
  onGraded: (rating: Rating) => void;
  onError: (message: string) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(card.prompt));
  const [checked, setChecked] = useState<Checked | null>(null);
  const [busy, setBusy] = useState(false);
  const shownAt = useRef(0);

  useEffect(() => {
    shownAt.current = Date.now();
  }, []);

  const reveal = useCallback(async () => {
    if (busy || checked) return;
    setBusy(true);
    try {
      const res = await fetch("/api/review/check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          activityId: card.activityId,
          response: toResponse(draft),
        }),
      });
      if (!res.ok) throw new Error(`Check failed (${res.status})`);
      setChecked((await res.json()) as Checked);
    } catch (cause) {
      onError(
        cause instanceof Error ? cause.message : "Could not check the answer.",
      );
    } finally {
      setBusy(false);
    }
  }, [busy, checked, card.activityId, draft, onError]);

  const grade = useCallback(
    async (rating: Rating) => {
      if (busy) return;
      setBusy(true);
      try {
        const res = await fetch("/api/review/grade", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            activityId: card.activityId,
            response: toResponse(draft),
            rating,
            mode: "queue",
            durationMs: Math.min(
              600_000,
              Math.max(0, Date.now() - shownAt.current),
            ),
          }),
        });
        if (!res.ok) throw new Error(`Grade failed (${res.status})`);
        await res.json();
        onGraded(rating);
      } catch (cause) {
        onError(
          cause instanceof Error ? cause.message : "Could not save the grade.",
        );
        setBusy(false);
      }
    },
    [busy, card.activityId, draft, onGraded, onError],
  );

  // Digits pick an option before the reveal and a rating after it.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;

      if (event.key === "Enter") {
        event.preventDefault();
        if (checked) void grade(checked.suggested);
        else void reveal();
        return;
      }

      const digit = Number(event.key);
      if (!Number.isInteger(digit) || digit < 1 || digit > 9) return;

      if (checked) {
        if (digit <= 4) {
          event.preventDefault();
          void grade(digit as Rating);
        }
        return;
      }

      const typing =
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(event.target.tagName);
      if (typing) return;

      const prompt = card.prompt;
      if (prompt.type !== "mcq" && prompt.type !== "select_all") return;
      if (digit > prompt.options.length) return;
      event.preventDefault();

      const index = digit - 1;
      if (prompt.type === "mcq") setDraft({ type: "mcq", choice: index });
      else
        setDraft((prev) => {
          const choices = prev.type === "select_all" ? prev.choices : [];
          return {
            type: "select_all",
            choices: choices.includes(index)
              ? choices.filter((i) => i !== index)
              : [...choices, index],
          };
        });
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checked, card.prompt, grade, reveal]);

  return (
    <Card>
      <CardHeader className="gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{card.type.replace("_", " ")}</Badge>
          <Badge variant="outline">{STATE_LABEL[card.state] ?? "new"}</Badge>
          {card.stale ? <Badge variant="destructive">stale</Badge> : null}
          <span className="text-muted-foreground">
            from {card.parentType} · {card.parentTitle}
          </span>
          <span className="ml-auto text-muted-foreground">
            {remaining} left in {scopeName}
          </span>
        </div>
      </CardHeader>

      <CardContent>
        <QuestionBody
          prompt={card.prompt}
          draft={draft}
          onChange={setDraft}
          revealed={checked?.expected ?? null}
          onSubmit={() => void reveal()}
        />

        {checked ? (
          <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {checked.selfRated ? (
                <Badge variant="outline">self-rated</Badge>
              ) : checked.correct ? (
                <Badge className="bg-green-600 text-white">correct</Badge>
              ) : (
                <Badge variant="destructive">incorrect</Badge>
              )}
              {checked.explanation ? (
                <p className="text-sm text-muted-foreground">
                  {checked.explanation}
                </p>
              ) : null}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {RATINGS.map((rating) => (
                <Button
                  key={rating.value}
                  variant={
                    rating.value === checked.suggested ? "default" : "outline"
                  }
                  disabled={busy}
                  onClick={() => void grade(rating.value)}
                  className="h-auto flex-col items-start gap-0.5 py-2"
                >
                  <span className="flex w-full items-center gap-1.5">
                    <kbd className="rounded border border-current/30 px-1 font-mono text-[10px] opacity-70">
                      {rating.value}
                    </kbd>
                    {rating.label}
                  </span>
                  <span className="text-xs opacity-70">
                    {checked.intervals[rating.value]}
                  </span>
                </Button>
              ))}
            </div>
          </div>
        ) : null}
      </CardContent>

      <CardFooter className="justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {checked ? "Pick how it felt — 1-4, or Enter for the suggestion." : HINTS[card.type]}
        </p>
        {!checked ? (
          <Button disabled={busy || !isAnswered(draft)} onClick={() => void reveal()}>
            {card.type === "closed" ? "Reveal" : "Check"}
          </Button>
        ) : null}
      </CardFooter>
    </Card>
  );
}

function Chip({
  active,
  count,
  color,
  onClick,
  children,
}: {
  active: boolean;
  count: number;
  color?: string | null;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-dashed text-muted-foreground line-through hover:bg-accent hover:no-underline",
      )}
    >
      {color ? (
        <span
          className={cn("size-2 rounded-full", !active && "opacity-40")}
          style={{ backgroundColor: color }}
        />
      ) : null}
      {children}
      <span className={cn("text-xs no-underline", active ? "opacity-80" : "opacity-60")}>
        {count}
      </span>
    </button>
  );
}

function QueueClear({
  scope,
  done,
  nextDue,
  now,
  skipping,
  onSkip,
}: {
  scope: string;
  done: number;
  nextDue: string | null;
  now: string;
  skipping: boolean;
  onSkip: () => void;
}) {
  const waitMs = nextDue ? Date.parse(nextDue) - Date.parse(now) : null;

  return (
    <div className="rounded-xl border border-dashed px-6 py-12 text-center">
      <p className="font-heading text-xl">Queue clear</p>
      <p className="mt-2 text-sm text-muted-foreground">
        {done > 0
          ? `${done} reviewed this session. Nothing else is due in ${scope} right now.`
          : `Nothing is due in ${scope} right now.`}
      </p>

      {waitMs !== null ? (
        <div className="mt-6 space-y-3">
          <p className="text-sm">
            Next card is due in <strong>{humanize(waitMs)}</strong>.
          </p>
          <Button disabled={skipping} onClick={onSkip}>
            {skipping ? "Skipping…" : `Skip ahead ${humanize(waitMs)}`}
          </Button>
          <p className="text-xs text-muted-foreground">
            Moves the clock, not the cards — FSRS keeps every interval it chose.
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-muted-foreground">
          Nothing is scheduled in this scope at all. Add activities, or widen the
          filter above.
        </p>
      )}
    </div>
  );
}
