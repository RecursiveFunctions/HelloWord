"use client";

/**
 * The clock preset switcher.
 *
 * Lives here rather than only in Settings because the preset is meaningless
 * until you are looking at a queue: "one day is one second" is a claim you have
 * to watch come true. Review renders it above the cards; Settings renders the
 * same control with the blurbs spelled out.
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SCHEDULER_PRESETS } from "@/lib/contracts/scheduling";
import { cn } from "@/lib/utils";

export function ClockPresets({
  dayMs,
  onChanged,
  verbose = false,
}: {
  dayMs: number;
  /** Review uses this to refetch the queue; Settings leaves it undefined. */
  onChanged?: (dayMs: number) => void;
  verbose?: boolean;
}) {
  const router = useRouter();
  const [active, setActive] = useState(dayMs);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(name: keyof typeof SCHEDULER_PRESETS) {
    const preset = SCHEDULER_PRESETS[name];
    if (preset.day_ms === active) return;
    const previous = active;
    setActive(preset.day_ms);

    startTransition(async () => {
      try {
        const res = await fetch("/api/scheduler/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ preset: name }),
        });
        if (!res.ok) throw new Error(`Could not switch clock (${res.status})`);
        setError(null);
        onChanged?.(preset.day_ms);
        router.refresh();
      } catch (cause) {
        setActive(previous);
        setError(cause instanceof Error ? cause.message : "Could not switch clock.");
      }
    });
  }

  return (
    <div className={verbose ? "space-y-3" : "space-y-1"}>
      <div
        className={cn(
          "inline-flex rounded-lg border p-0.5",
          verbose && "flex-col items-stretch sm:flex-row",
        )}
      >
        {Object.values(SCHEDULER_PRESETS).map((preset) => {
          const on = preset.day_ms === active;
          return (
            <button
              key={preset.name}
              type="button"
              disabled={pending}
              title={preset.blurb}
              onClick={() => choose(preset.name)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs transition disabled:opacity-60",
                on
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {preset.label}
              {verbose ? (
                <span className="ml-1.5 font-mono opacity-70">
                  1d = {formatDayMs(preset.day_ms)}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {verbose ? (
        <ul className="space-y-1 text-xs text-muted-foreground">
          {Object.values(SCHEDULER_PRESETS).map((preset) => (
            <li key={preset.name}>
              <strong className="text-foreground">{preset.label}</strong> —{" "}
              {preset.blurb}
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}

function formatDayMs(ms: number): string {
  if (ms >= 86_400_000) return "1d";
  if (ms >= 60_000) return `${ms / 60_000}m`;
  return `${ms / 1_000}s`;
}
