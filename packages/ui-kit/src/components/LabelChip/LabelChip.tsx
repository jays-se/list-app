import type { ReactNode } from "react"
import { cx } from "../../cx.ts"
import type { PaletteKey } from "../../tokens/alias.ts"
import styles from "./LabelChip.module.css"

export interface LabelChipProps {
  color: PaletteKey
  children: ReactNode
  size?: "small" | "medium"
  className?: string
}

/** A task label: palette tint + text; the dot keeps colour non-essential. */
export function LabelChip({
  color,
  children,
  size = "medium",
  className,
}: LabelChipProps) {
  return (
    <span className={cx(styles.root, styles[color], styles[size], className)}>
      <span className={styles.dot} aria-hidden="true" />
      {children}
    </span>
  )
}
