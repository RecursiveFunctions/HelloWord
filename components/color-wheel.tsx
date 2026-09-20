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

const FAN_RADIUS_PX = 88;
const FAN_ANGLES_DEG = [15, 30, 45, 60, 75, 90] as const;

export const themeInitScript = `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});if(${JSON.stringify(THEME_IDS)}.indexOf(t)===-1)t=${JSON.stringify(DEFAULT_THEME)};document.documentElement.dataset.theme=t;document.documentElement.classList.toggle("dark",t==="black")}catch(e){}`;

function isThemeId(value: string | null): value is ThemeId {
  return THEME_IDS.includes(value as ThemeId);
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.classList.toggle("dark", theme === "black");
}

export function ColorWheel() {
  const labelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME);

  useEffect(() => {
    const current = document.documentElement.dataset.theme;
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (isThemeId(current ?? null)) setTheme(current as ThemeId);
    else if (isThemeId(saved)) setTheme(saved);
    else setTheme(DEFAULT_THEME);
  }, []);

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
    <div
      ref={rootRef}
      className="pointer-events-none fixed z-100"
      style={{
        left: "calc(1rem + env(safe-area-inset-left, 0px))",
        bottom: "calc(1rem + env(safe-area-inset-bottom, 0px))",
      }}
    >
      <div className="relative size-11">
        <div
          role="group"
          aria-labelledby={labelId}
          className="absolute inset-0"
        >
          {THEMES.map((option, index) => {
            const angle = (FAN_ANGLES_DEG[index] * Math.PI) / 180;
            const x = Math.cos(angle) * FAN_RADIUS_PX;
            const y = -Math.sin(angle) * FAN_RADIUS_PX;
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
                  "absolute top-1/2 left-1/2 size-8 rounded-full border-0 shadow-sm outline-none",
                  "transition-[translate,scale,opacity,box-shadow] duration-200 ease-out",
                  "focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  "motion-safe:hover:scale-125 motion-safe:hover:shadow-md",
                  open
                    ? "pointer-events-auto translate-x-[calc(-50%+var(--fan-x))] translate-y-[calc(-50%+var(--fan-y))] scale-100 opacity-100 hover:z-20"
                    : "pointer-events-none -translate-x-1/2 -translate-y-1/2 scale-40 opacity-0",
                  option.id === "white" && "shadow-[0_0_0_1px_rgba(0,0,0,0.12)]",
                  option.id === "black" && "shadow-[0_0_0_1px_rgba(255,255,255,0.22)]",
                  selected &&
                    "ring-2 ring-foreground ring-offset-2 ring-offset-background",
                )}
                style={
                  {
                    "--fan-x": `${x}px`,
                    "--fan-y": `${y}px`,
                    backgroundColor: option.swatch,
                  } as CSSProperties
                }
              />
            );
          })}
        </div>

        <button
          type="button"
          id={labelId}
          aria-label="Color theme"
          aria-expanded={open}
          aria-haspopup="true"
          onClick={() => setOpen((current) => !current)}
          className="pointer-events-auto relative z-10 size-11 rounded-full border-0 shadow-md outline-none transition-[scale,rotate,box-shadow] duration-300 ease-out hover:scale-110 hover:rotate-12 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:hover:rotate-0"
          style={{
            background:
              "conic-gradient(from 210deg, oklch(0.995 0 0), oklch(0.86 0.08 350), oklch(0.92 0.1 95), oklch(0.88 0.08 150), oklch(0.86 0.07 250), oklch(0.2 0 0), oklch(0.995 0 0))",
          }}
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
