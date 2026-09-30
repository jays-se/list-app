import { cx } from "../../cx.ts"
import { FlagIcon } from "../../icons/index.tsx"
import type { PaletteKey } from "../../tokens/alias.ts"
import styles from "./Swatch.module.css"

export interface SwatchProps {
  color: PaletteKey
  /** dot: status/client colour; square: tiles; flag: priority. */
  shape?: "dot" | "square" | "flag"
  className?: string
}

/** A small decorative colour marker; always pair it with text. */
export function Swatch({ color, shape = "dot", className }: SwatchProps) {
  if (shape === "flag") {
    return (
      <span
        className={cx(styles.flag, styles[color], className)}
        aria-hidden="true"
      >
        <FlagIcon size={16} />
      </span>
    )
  }
  return (
    <span
      className={cx(styles.root, styles[shape], styles[color], className)}
      aria-hidden="true"
    />
  )
}
