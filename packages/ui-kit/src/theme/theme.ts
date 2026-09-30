export type ThemeName = "system" | "light" | "dark" | "hc"

const STORAGE_KEY = "app.theme"
const THEMES: readonly ThemeName[] = ["system", "light", "dark", "hc"]

/**
 * Applies a theme by setting `data-theme` on <html>; CSS variables switch
 * without any React re-render (ADR-0014). "system" follows the OS setting.
 */
export function applyTheme(theme: ThemeName, root = document.documentElement) {
  if (theme === "system") delete root.dataset.theme
  else root.dataset.theme = theme
}

/** Per-viewer preference; storage failures (private mode) fall back to system. */
export function loadTheme(): ThemeName {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return THEMES.includes(stored as ThemeName)
      ? (stored as ThemeName)
      : "system"
  } catch {
    return "system"
  }
}

export function saveTheme(theme: ThemeName): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Ignore: preference simply won't persist.
  }
}
