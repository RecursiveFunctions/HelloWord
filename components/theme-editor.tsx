"use client";

import { useState, type ReactNode } from "react";
import { Check, Moon, Sun, SunMoon } from "lucide-react";
import {
  ACCENTS,
  MODES,
  SURFACES,
  TEXT_SIZES,
  type Mode,
  type SurfaceId,
  type TextSize,
  type ThemeSettings,
} from "@/lib/themes";
import { readTheme, saveTheme } from "@/lib/theme-runtime";
import { cn } from "@/lib/utils";

const MODE_META: Record<Mode, { label: string; icon: typeof Sun }> = {
  light: { label: "Light", icon: Sun },
  dark: { label: "Dark", icon: Moon },
  auto: { label: "Auto", icon: SunMoon },
};

const TEXT_META: Record<TextSize, { label: string; sample: string }> = {
  small: { label: "Small", sample: "text-sm" },
  medium: { label: "Medium", sample: "text-base" },
  large: { label: "Large", sample: "text-xl" },
};

const SURFACE_PREVIEW: Record<
  SurfaceId,
  { bg: string; card: string; line: string }
> = {
  clean: {
    bg: "oklch(0.968 0.003 260)",
    card: "oklch(1 0 0)",
    line: "oklch(0.9 0.004 260)",
  },
  paper: {
    bg: "oklch(0.955 0.018 88)",
    card: "oklch(0.985 0.012 88)",
    line: "oklch(0.88 0.02 85)",
  },
  slate: {
    bg: "oklch(0.94 0.014 255)",
    card: "oklch(0.985 0.005 255)",
    line: "oklch(0.87 0.015 255)",
  },
};

const HUE_WHEEL =
  "conic-gradient(oklch(0.65 0.2 0), oklch(0.75 0.2 60), oklch(0.8 0.2 120), oklch(0.7 0.15 180), oklch(0.65 0.2 240), oklch(0.65 0.22 300), oklch(0.65 0.2 360))";

const swatchButton =
  "grid size-11 place-items-center rounded-full text-white outline-none transition-transform active:scale-95 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card";
const swatchSelected = "ring-2 ring-foreground ring-offset-2 ring-offset-card";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-muted-foreground">{label}</h3>
      {children}
    </div>
  );
}

function Segmented({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-full rounded-2xl bg-muted p-1 sm:w-auto"
    >
      {children}
    </div>
  );
}

function segment(selected: boolean) {
  return cn(
    "flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-medium outline-none transition-colors sm:flex-none",
    "focus-visible:ring-2 focus-visible:ring-ring",
    selected
      ? "bg-card text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );
}

export function ThemeEditor() {
  // The init script already applied the saved theme; read it for the controls.
  const [theme, setTheme] = useState<ThemeSettings>(readTheme);

  function update(patch: Partial<ThemeSettings>) {
    const next = { ...theme, ...patch };
    setTheme(next);
    const root = document.documentElement;
    root.classList.add("theme-transition");
    saveTheme(next);
    window.setTimeout(() => root.classList.remove("theme-transition"), 250);
  }

  const customSelected = theme.accent === "custom";

  return (
    <div className="space-y-8">
      <Field label="Accent">
        <div
          role="radiogroup"
          aria-label="Accent colour"
          className="flex flex-wrap gap-3"
        >
          {ACCENTS.map((accent) => {
            const selected = theme.accent === accent.id;
            return (
              <button
                key={accent.id}
                type="button"
                role="radio"
                aria-checked={selected}
                aria-label={accent.label}
                title={accent.label}
                onClick={() => update({ accent: accent.id })}
                className={cn(swatchButton, selected && swatchSelected)}
                style={{
                  background: `oklch(${accent.lightness} ${accent.chroma} ${accent.hue})`,
                }}
              >
                {selected ? <Check className="size-5" aria-hidden /> : null}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={customSelected}
            aria-label="Custom colour"
            title="Custom"
            onClick={() => update({ accent: "custom" })}
            className={cn(swatchButton, customSelected && swatchSelected)}
            style={{ background: HUE_WHEEL }}
          >
            {customSelected ? <Check className="size-5" aria-hidden /> : null}
          </button>
        </div>

        {customSelected ? (
          <label className="flex items-center gap-4">
            <span className="w-12 text-sm text-muted-foreground">Hue</span>
            <input
              type="range"
              min={0}
              max={360}
              value={theme.hue}
              onChange={(event) => update({ hue: Number(event.target.value) })}
              aria-label="Custom hue"
              className="hue-slider h-11 flex-1 cursor-pointer"
            />
          </label>
        ) : null}
      </Field>

      <Field label="Mode">
        <Segmented label="Light or dark">
          {MODES.map((mode) => {
            const { label, icon: Icon } = MODE_META[mode];
            return (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={theme.mode === mode}
                onClick={() => update({ mode })}
                className={segment(theme.mode === mode)}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            );
          })}
        </Segmented>
      </Field>

      <Field label="Surface">
        <div
          role="radiogroup"
          aria-label="Surface style"
          className="grid gap-3 sm:grid-cols-3"
        >
          {SURFACES.map((surface) => {
            const selected = theme.surface === surface.id;
            const preview = SURFACE_PREVIEW[surface.id];
            return (
              <button
                key={surface.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => update({ surface: surface.id })}
                className={cn(
                  "rounded-2xl border p-2 text-left outline-none transition-[box-shadow,border-color] active:scale-[0.99]",
                  "focus-visible:ring-2 focus-visible:ring-ring",
                  selected
                    ? "border-primary ring-2 ring-primary"
                    : "hover:border-foreground/30",
                )}
              >
                <span
                  aria-hidden
                  className="block h-16 rounded-xl p-2"
                  style={{ background: preview.bg }}
                >
                  <span
                    className="block h-full rounded-lg border"
                    style={{ background: preview.card, borderColor: preview.line }}
                  >
                    <span className="m-2 block h-1.5 w-1/2 rounded-full bg-primary" />
                    <span
                      className="mx-2 block h-1.5 w-3/4 rounded-full"
                      style={{ background: preview.line }}
                    />
                  </span>
                </span>
                <span className="mt-2 block px-1 text-sm font-medium">
                  {surface.label}
                </span>
                <span className="block px-1 pb-1 text-xs text-muted-foreground">
                  {surface.note}
                </span>
              </button>
            );
          })}
        </div>
      </Field>

      <Field label="Text size">
        <Segmented label="Text size">
          {TEXT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              role="radio"
              aria-checked={theme.textSize === size}
              onClick={() => update({ textSize: size })}
              className={cn(segment(theme.textSize === size), TEXT_META[size].sample)}
            >
              {TEXT_META[size].label}
            </button>
          ))}
        </Segmented>
      </Field>

      <Preview />
    </div>
  );
}

/** Live sample built from real tokens, so it always matches the choices above. */
function Preview() {
  return (
    <div className="rounded-2xl border bg-background p-4">
      <div className="rounded-xl border bg-card p-4 shadow-float">
        <p className="font-serif text-lg font-semibold">
          Spaced repetition, briefly
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Notes are the pivot; activities are scheduled from them.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
            Extract
          </span>
          <span className="rounded-full bg-accent-soft px-4 py-2 text-sm font-medium text-accent-strong">
            Cloze
          </span>
          <span className="rounded-full border px-4 py-2 text-sm text-muted-foreground">
            Skip
          </span>
        </div>
      </div>
    </div>
  );
}
