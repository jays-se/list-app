import { cx } from "../../cx.ts"
import styles from "./Spinner.module.css"

export interface SpinnerProps {
  size?: "tiny" | "small" | "medium" | "large"
  /** Visible label; also the accessible name. Defaults to a hidden "Loading". */
  label?: string
  className?: string
}

const PX = { tiny: 16, small: 20, medium: 28, large: 36 } as const

export function Spinner({ size = "medium", label, className }: SpinnerProps) {
  const px = PX[size]
  return (
    <span
      role="progressbar"
      aria-label={label ?? "Loading"}
      className={cx(styles.root, className)}
    >
      <svg
        className={styles.ring}
        width={px}
        height={px}
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className={styles.track} cx="12" cy="12" r="10" />
        <circle className={styles.tail} cx="12" cy="12" r="10" />
      </svg>
      {label && <span className={styles.label}>{label}</span>}
    </span>
  )
}
