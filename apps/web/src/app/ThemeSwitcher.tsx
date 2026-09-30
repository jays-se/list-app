import {
  applyTheme,
  loadTheme,
  Select,
  saveTheme,
  type ThemeName,
} from "@app/ui-kit"
import { useId, useState } from "react"
import styles from "./ThemeSwitcher.module.css"

const OPTIONS: { value: ThemeName; label: string }[] = [
  { value: "system", label: "System" },
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "hc", label: "High contrast" },
]

/** UI preference only (not server data), so local state is fine here. */
export function ThemeSwitcher() {
  const id = useId()
  const [theme, setTheme] = useState<ThemeName>(loadTheme)
  return (
    <span className={styles.root}>
      <label htmlFor={id} className={styles.label}>
        Theme
      </label>
      <Select
        id={id}
        size="small"
        value={theme}
        onChange={(event) => {
          const next = event.target.value as ThemeName
          setTheme(next)
          applyTheme(next)
          saveTheme(next)
        }}
      >
        {OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </Select>
    </span>
  )
}
