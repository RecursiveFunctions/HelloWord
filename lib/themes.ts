/**
 * App theme = accent + mode + surface. Every colour in the UI derives from
 * these three choices (see `app/globals.css`), so any combination stays
 * consistent and readable.
 */
export const ACCENTS = [
  { id: "indigo", label: "Indigo", hue: 275, chroma: 0.2, lightness: 0.48 },
  { id: "blue", label: "Blue", hue: 250, chroma: 0.19, lightness: 0.48 },
  { id: "teal", label: "Teal", hue: 195, chroma: 0.11, lightness: 0.48 },
  { id: "green", label: "Green", hue: 150, chroma: 0.14, lightness: 0.48 },
  { id: "amber", label: "Amber", hue: 65, chroma: 0.14, lightness: 0.5 },
  { id: "orange", label: "Orange", hue: 45, chroma: 0.17, lightness: 0.5 },
  { id: "rose", label: "Rose", hue: 10, chroma: 0.2, lightness: 0.52 },
  { id: "violet", label: "Violet", hue: 310, chroma: 0.2, lightness: 0.48 },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"] | "custom";

export const MODES = ["light", "dark", "auto"] as const;
export type Mode = (typeof MODES)[number];

export const SURFACES = [
  { id: "clean", label: "Clean", note: "Crisp and neutral" },
  { id: "paper", label: "Paper", note: "Warm and easy on the eyes" },
  { id: "slate", label: "Slate", note: "Cool blue-grey" },
] as const;
export type SurfaceId = (typeof SURFACES)[number]["id"];

export const TEXT_SIZES = ["small", "medium", "large"] as const;
export type TextSize = (typeof TEXT_SIZES)[number];

export type ThemeSettings = {
  accent: AccentId;
  /** Only used when `accent` is "custom". 0-360. */
  hue: number;
  mode: Mode;
  surface: SurfaceId;
  textSize: TextSize;
};

export const DEFAULT_THEME: ThemeSettings = {
  accent: "indigo",
  hue: 275,
  mode: "auto",
  surface: "clean",
  textSize: "medium",
};

/** Colours the browser / installed PWA chrome takes on. */
export const THEME_COLOR = { light: "#f6f6f8", dark: "#131316" } as const;

/**
 * Notebook cover colours. These are stored in the database by value, so the
 * swatch strings below must not change even though the app theme no longer
 * uses them.
 */
export const THEMES = [
  { id: "red", label: "Red", swatch: "oklch(0.65 0.2 25)" },
  { id: "orange", label: "Orange", swatch: "oklch(0.74 0.18 55)" },
  { id: "yellow", label: "Yellow", swatch: "oklch(0.86 0.17 95)" },
  { id: "green", label: "Green", swatch: "oklch(0.7 0.17 145)" },
  { id: "blue", label: "Blue", swatch: "oklch(0.65 0.16 250)" },
  { id: "purple", label: "Purple", swatch: "oklch(0.65 0.19 300)" },
  { id: "pink", label: "Pink", swatch: "oklch(0.7 0.18 350)" },
] as const;

export const NOTEBOOK_COLORS: readonly {
  id: string;
  label: string;
  swatch: string;
}[] = THEMES;

export const NOTEBOOK_COLOR_VALUES = NOTEBOOK_COLORS.map(
  (theme) => theme.swatch,
);

export const THEME_SWATCHES = Object.fromEntries(
  THEMES.map((theme) => [theme.id, theme.swatch]),
) as Record<(typeof THEMES)[number]["id"], string>;

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
