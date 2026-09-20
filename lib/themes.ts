export const THEME_IDS = [
  "white",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
  "pink",
  "rainbow",
  "paper",
  "black",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "white";

export const THEMES = [
  { id: "white", label: "White", swatch: "oklch(0.995 0 0)" },
  { id: "red", label: "Red", swatch: "oklch(0.65 0.2 25)" },
  { id: "orange", label: "Orange", swatch: "oklch(0.74 0.18 55)" },
  { id: "yellow", label: "Yellow", swatch: "oklch(0.86 0.17 95)" },
  { id: "green", label: "Green", swatch: "oklch(0.7 0.17 145)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.65 0.16 250)" },
  { id: "purple", label: "Purple", swatch: "oklch(0.65 0.19 300)" },
  { id: "pink", label: "Pink", swatch: "oklch(0.7 0.18 350)" },
  {
    id: "rainbow",
    label: "Rainbow",
    swatch:
      "conic-gradient(from 210deg, oklch(0.72 0.18 25), oklch(0.78 0.14 55), oklch(0.88 0.12 95), oklch(0.8 0.12 145), oklch(0.78 0.1 230), oklch(0.72 0.12 290), oklch(0.76 0.14 340), oklch(0.72 0.18 25))",
  },
  {
    id: "paper",
    label: "Lined paper",
    swatch:
      "repeating-linear-gradient(to bottom, oklch(0.995 0 0) 0 4px, oklch(0.55 0.14 250) 4px 6px)",
  },
  { id: "black", label: "Black", swatch: "oklch(0.2 0 0)" },
] as const;

export const NOTEBOOK_COLORS = THEMES.filter(
  (theme) =>
    theme.id !== "white" &&
    theme.id !== "black" &&
    theme.id !== "rainbow" &&
    theme.id !== "paper",
);

export const NOTEBOOK_COLOR_VALUES = NOTEBOOK_COLORS.map(
  (theme) => theme.swatch,
);

export const THEME_SWATCHES = Object.fromEntries(
  THEMES.map((theme) => [theme.id, theme.swatch]),
) as Record<ThemeId, string>;

const LEGACY_NOTEBOOK_COLORS: Record<string, string> = {
  "#c2410c": THEME_SWATCHES.yellow,
  "#1d4ed8": THEME_SWATCHES.blue,
  "#15803d": THEME_SWATCHES.green,
  "#7e22ce": THEME_SWATCHES.pink,
  "#b91c1c": THEME_SWATCHES.red,
  "#0f766e": THEME_SWATCHES.green,
};

/** Map stored notebook colours onto the current wheel swatches. */
export function resolveNotebookColor(color: string | null | undefined): string {
  if (!color) return "var(--color-primary)";
  return LEGACY_NOTEBOOK_COLORS[color] ?? color;
}

/**
 * `next/og` / Satori only understands hex (and a few named colours). Theme
 * wheel swatches are oklch, so cover and preview images need this map.
 */
const NOTEBOOK_COVER_HEX: Record<string, string> = {
  [THEME_SWATCHES.red]: "#dc2626",
  [THEME_SWATCHES.orange]: "#ea580c",
  [THEME_SWATCHES.yellow]: "#ca8a04",
  [THEME_SWATCHES.green]: "#16a34a",
  [THEME_SWATCHES.blue]: "#2563eb",
  [THEME_SWATCHES.purple]: "#9333ea",
  [THEME_SWATCHES.pink]: "#db2777",
  "#c2410c": "#c2410c",
  "#1d4ed8": "#1d4ed8",
  "#15803d": "#15803d",
  "#7e22ce": "#7e22ce",
  "#b91c1c": "#b91c1c",
  "#0f766e": "#0f766e",
};

export function resolveNotebookCoverColor(
  color: string | null | undefined,
): string {
  if (!color) return "#c2410c";
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return NOTEBOOK_COVER_HEX[color] ?? "#c2410c";
}
