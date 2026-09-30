import {
  applyTheme,
  Dropdown,
  loadTheme,
  MoonIcon,
  SunIcon,
  saveTheme,
  type ThemeName,
} from "@app/ui-kit"
import { useState } from "react"
import styles from "./ThemeSwitcher.module.css"

export const THEME_OPTIONS: { value: ThemeName; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "hc", label: "High contrast" },
]

/**
 * For pages outside the shell (sign-in, onboarding); inside it the theme
 * is in the account menu. A UI preference, so local state is fine.
 */
export function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeName>(loadTheme)
  return (
    <span className={styles.root}>
      <Dropdown
        aria-label="Theme"
        size="small"
        appearance="subtle"
        value={theme}
        options={THEME_OPTIONS.map((o) => ({
          ...o,
          media:
            o.value === "light" ? (
              <SunIcon size={16} />
            ) : (
              <MoonIcon size={16} />
            ),
        }))}
        onChange={(next) => {
          setTheme(next)
          applyTheme(next)
          saveTheme(next)
        }}
      />
    </span>
  )
}
