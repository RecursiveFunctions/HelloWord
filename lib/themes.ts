export const THEME_IDS = [
  "white",
  "pink",
  "yellow",
  "blue",
  "green",
  "black",
] as const;

export type ThemeId = (typeof THEME_IDS)[number];

export const DEFAULT_THEME: ThemeId = "white";

export const THEMES = [
  { id: "white", label: "White", swatch: "oklch(0.995 0 0)" },
  { id: "pink", label: "Pastel pink", swatch: "oklch(0.86 0.08 350)" },
  { id: "yellow", label: "Pastel yellow", swatch: "oklch(0.92 0.1 95)" },
  { id: "blue", label: "Pastel blue", swatch: "oklch(0.86 0.07 250)" },
  { id: "green", label: "Pastel green", swatch: "oklch(0.88 0.08 150)" },
  { id: "black", label: "Black", swatch: "oklch(0.2 0 0)" },
] as const;

export const NOTEBOOK_COLORS = THEMES.filter(
  (theme) => theme.id !== "white" && theme.id !== "black",
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
  "#b91c1c": THEME_SWATCHES.pink,
  "#0f766e": THEME_SWATCHES.green,
};

/** Map stored notebook colours onto the current wheel swatches. */
export function resolveNotebookColor(color: string | null | undefined): string {
  if (!color) return "var(--color-primary)";
  return LEGACY_NOTEBOOK_COLORS[color] ?? color;
}
