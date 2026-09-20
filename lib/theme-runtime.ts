import {
  ACCENTS,
  DEFAULT_THEME,
  MODES,
  SURFACES,
  TEXT_SIZES,
  THEME_COLOR,
  type AccentId,
  type ThemeSettings,
} from "./themes";

export const THEME_STORAGE_KEY = "helloword-theme";

const ACCENT_IDS: string[] = [...ACCENTS.map((a) => a.id), "custom"];
const SURFACE_IDS: string[] = SURFACES.map((s) => s.id);

/** Root font-size per text size; the whole UI is rem-based so it all scales. */
const ROOT_FONT_SIZE = { small: "93.75%", medium: "100%", large: "112.5%" };

/** Pre-redesign installs stored one of eleven flat theme ids as a plain string. */
const LEGACY_ACCENT: Record<string, AccentId> = {
  red: "rose",
  pink: "rose",
  yellow: "amber",
  orange: "orange",
  green: "green",
  blue: "blue",
  purple: "violet",
};

export function parseTheme(raw: string | null): ThemeSettings {
  if (!raw) return DEFAULT_THEME;

  let value: unknown = null;
  try {
    value = JSON.parse(raw);
  } catch {
    // Legacy plain-string value, handled below.
  }

  if (!value || typeof value !== "object") {
    if (raw === "black") return { ...DEFAULT_THEME, mode: "dark" };
    if (raw === "paper")
      return { ...DEFAULT_THEME, mode: "light", surface: "paper" };
    if (raw in LEGACY_ACCENT)
      return { ...DEFAULT_THEME, mode: "light", accent: LEGACY_ACCENT[raw] };
    return DEFAULT_THEME;
  }

  const v = value as Partial<ThemeSettings>;
  const hue = Number(v.hue);
  return {
    accent: ACCENT_IDS.includes(v.accent as string)
      ? (v.accent as AccentId)
      : DEFAULT_THEME.accent,
    hue: Number.isFinite(hue) ? Math.min(360, Math.max(0, hue)) : DEFAULT_THEME.hue,
    mode: MODES.includes(v.mode as never) ? v.mode! : DEFAULT_THEME.mode,
    surface: SURFACE_IDS.includes(v.surface as string)
      ? v.surface!
      : DEFAULT_THEME.surface,
    textSize: TEXT_SIZES.includes(v.textSize as never)
      ? v.textSize!
      : DEFAULT_THEME.textSize,
  };
}

export function readTheme(): ThemeSettings {
  try {
    return parseTheme(localStorage.getItem(THEME_STORAGE_KEY));
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolveDark(mode: ThemeSettings["mode"]): boolean {
  if (mode === "dark") return true;
  if (mode === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Push a theme onto the document. Safe to call repeatedly. */
export function applyTheme(theme: ThemeSettings) {
  const root = document.documentElement;
  const dark = resolveDark(theme.mode);

  root.dataset.accent = theme.accent;
  root.dataset.surface = theme.surface;
  if (theme.accent === "custom") {
    root.style.setProperty("--hue", String(theme.hue));
  } else {
    root.style.removeProperty("--hue");
  }
  root.classList.toggle("dark", dark);
  root.style.fontSize = ROOT_FONT_SIZE[theme.textSize];

  // Keep browser / installed-app chrome in step with the chosen mode instead
  // of the OS preference the static viewport metadata was written for.
  const color = dark ? THEME_COLOR.dark : THEME_COLOR.light;
  document
    .querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')
    .forEach((meta) => {
      meta.removeAttribute("media");
      meta.content = color;
    });
}

export function saveTheme(theme: ThemeSettings) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // Storage can be unavailable (private mode); the theme still applies.
  }
  applyTheme(theme);
}

/**
 * Runs before first paint so there is no flash of the wrong theme. Kept as a
 * plain self-contained string (no imports at runtime); it mirrors
 * `parseTheme` + `applyTheme` above.
 */
export const themeInitScript = `try{var d=document.documentElement,r=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}),t=null,A=${JSON.stringify(ACCENT_IDS)},S=${JSON.stringify(SURFACE_IDS)},F=${JSON.stringify(ROOT_FONT_SIZE)},D=${JSON.stringify(DEFAULT_THEME)};try{t=JSON.parse(r)}catch(e){}if(!t||typeof t!=="object"){var L=${JSON.stringify(LEGACY_ACCENT)};t={};if(r==="black")t.mode="dark";else if(r==="paper"){t.mode="light";t.surface="paper"}else if(r&&L[r]){t.mode="light";t.accent=L[r]}}var a=A.indexOf(t.accent)>-1?t.accent:D.accent,s=S.indexOf(t.surface)>-1?t.surface:D.surface,m=["light","dark","auto"].indexOf(t.mode)>-1?t.mode:D.mode,h=Number(t.hue);d.dataset.accent=a;d.dataset.surface=s;if(a==="custom"&&isFinite(h))d.style.setProperty("--hue",String(Math.min(360,Math.max(0,h))));d.classList.toggle("dark",m==="dark"||(m==="auto"&&matchMedia("(prefers-color-scheme: dark)").matches));if(F[t.textSize])d.style.fontSize=F[t.textSize]}catch(e){}`;
