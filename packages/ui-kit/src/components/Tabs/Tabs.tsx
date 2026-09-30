import { type KeyboardEvent, type ReactNode, useId, useRef } from "react"
import { cx } from "../../cx.ts"
import styles from "./Tabs.module.css"

export interface TabItem<V extends string> {
  value: V
  label: ReactNode
}

export interface TabsProps<V extends string> {
  items: TabItem<V>[]
  value: V
  onChange: (value: V) => void
  label: string
  /** Renders the selected panel. */
  children: ReactNode
}

/**
 * WAI-ARIA tabs (automatic activation): arrow keys / Home / End move and
 * select; only the selected tab is in the tab order.
 */
export function Tabs<V extends string>({
  items,
  value,
  onChange,
  label,
  children,
}: TabsProps<V>) {
  const id = useId()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const index = Math.max(
    0,
    items.findIndex((t) => t.value === value)
  )

  function onKeyDown(e: KeyboardEvent) {
    const last = items.length - 1
    const next =
      e.key === "ArrowRight"
        ? index === last
          ? 0
          : index + 1
        : e.key === "ArrowLeft"
          ? index === 0
            ? last
            : index - 1
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : -1
    if (next === -1) return
    e.preventDefault()
    const item = items[next]
    if (!item) return
    onChange(item.value)
    refs.current[next]?.focus()
  }

  return (
    <div className={styles.root}>
      <div
        role="tablist"
        aria-label={label}
        className={styles.list}
        onKeyDown={onKeyDown}
      >
        {items.map((t, i) => (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="tab"
            id={`${id}-tab-${t.value}`}
            aria-selected={t.value === value}
            aria-controls={`${id}-panel`}
            tabIndex={t.value === value ? 0 : -1}
            className={cx(styles.tab, t.value === value && styles.selected)}
            onClick={() => onChange(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${id}-panel`}
        aria-labelledby={`${id}-tab-${items[index]?.value ?? ""}`}
        className={styles.panel}
      >
        {children}
      </div>
    </div>
  )
}
