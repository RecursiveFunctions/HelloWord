"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import {
  DEFAULT_THEME,
  THEME_IDS,
  THEMES,
  type ThemeId,
} from "@/lib/themes";
import { cn } from "@/lib/utils";

export const THEME_STORAGE_KEY = "helloword-theme";
export { DEFAULT_THEME, THEME_IDS, type ThemeId };

const FAN_RADIUS_PX = 128;
const FAN_START_DEG = 50;
const FAN_END_DEG = -85;

const WHEEL_GRADIENT =
  "conic-gradient(from 210deg, oklch(0.995 0 0), oklch(0.65 0.2 25), oklch(0.74 0.18 55), oklch(0.86 0.17 95), oklch(0.7 0.17 145), oklch(0.65 0.16 250), oklch(0.65 0.19 300), oklch(0.7 0.18 350), oklch(0.2 0 0), oklch(0.995 0 0))";

export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEME_IDS)}.indexOf(t)===-1)t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.dataset.theme=t;document.documentElement.classList.toggle("dark",t==="black")}catch(e){}`;

function isThemeId(value: string | null): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

function initialTheme(): ThemeId {
  if (typeof document === "undefined") return DEFAULT_THEME;

  const current = document.documentElement.dataset.theme;
  if (isThemeId(current ?? null)) return current as ThemeId;

  const saved = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeId(saved) ? saved : DEFAULT_THEME;
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "black");
}

function fanOffset(index: number, count: number) {
  const t = count === 1 ? 0.5 : index / (count - 1);
  const deg = FAN_START_DEG + (FAN_END_DEG - FAN_START_DEG) * t;
  const angle = (deg * Math.PI) / 180;
  return {
    x: Math.cos(angle) * FAN_RADIUS_PX,
    y: -Math.sin(angle) * FAN_RADIUS_PX,
  };
}

export function ColorWheel() {
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(initialTheme);

  useEffect(() => {
    if (!open) return;

    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  function selectTheme(id: ThemeId) {
    applyTheme(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
    setTheme(id);
    setOpen(false);
  }

  return (
    <div ref={rootRef} className="flex items-center gap-3">
      <h2 id={labelId} className="font-heading text-lg">
        Theme
      </h2>
      <div className="relative z-20 size-11">
        <div role="group" aria-labelledby={labelId} className="absolute inset-0">
          {THEMES.map((option, index) => {
            const { x, y } = fanOffset(index, THEMES.length);
            const selected = theme === option.id;

            return (
              <button
                key={option.id}
                type="button"
                tabIndex={open ? 0 : -1}
                aria-label={option.label}
                aria-pressed={selected}
                onClick={() => selectTheme(option.id)}
                className={cn(
                  "absolute top-1/2 left-1/2 size-8 overflow-hidden rounded-full border-0 shadow-sm outline-none",
                  "transition-[translate,scale,opacity,box-shadow] duration-200 ease-out",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "motion-safe:hover:scale-125 motion-safe:hover:shadow-md",
                  open
                    ? "pointer-events-auto translate-x-[calc(-50%+var(--fan-x))] translate-y-[calc(-50%+var(--fan-y))] scale-100 opacity-100 hover:z-20"
                    : "pointer-events-none -translate-x-1/2 -translate-y-1/2 scale-40 opacity-0",
                  (option.id === "white" || option.id === "paper") &&
                    "shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
                  option.id === "black" &&
                    "shadow-[0_0_0_1px_rgba(255,255,255,0.22)]",
                  selected &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
                style={
                  {
                    "--fan-x": `${x}px`,
                    "--fan-y": `${y}px`,
                    background:
                      option.id === "paper" ? "oklch(0.995 0 0)" : option.swatch,
                  } as CSSProperties
                }
              >
                {option.id === "paper"
                  ? [0, 1, 2, 3, 4].map((line) => (
                      <span
                        key={line}
                        aria-hidden
                        className="absolute right-0 left-0 h-[2px] bg-[oklch(0.55_0.14_250)]"
                        style={{ top: `${14 + line * 16}%` }}
                      />
                    ))
                  : null}
              </button>
            );
          })}
        </div>

        <button
          type="button"
          aria-label="Color theme"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((current) => !current)}
          className="relative z-10 size-11 rounded-full border-0 shadow-md outline-none transition-[scale,rotate,box-shadow] duration-300 ease-out hover:scale-110 hover:rotate-12 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:hover:rotate-0"
          style={{ background: WHEEL_GRADIENT }}
        >
          <span
            aria-hidden
            className="absolute inset-[30%] rounded-full bg-background/85 shadow-inner"
          />
        </button>
      </div>
    </div>
  );
}
