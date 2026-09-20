"use client";

import { useEffect } from "react";
import { applyTheme, readTheme } from "@/lib/theme-runtime";

/**
 * The init script sets the theme before paint. This finishes the job once the
 * app is running (browser chrome colour) and keeps "Auto" mode following the
 * operating system while the app is open.
 */
export function ThemeSync() {
  useEffect(() => {
    applyTheme(readTheme());

    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      const theme = readTheme();
      if (theme.mode === "auto") applyTheme(theme);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return null;
}
