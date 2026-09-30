import { type InputHTMLAttributes, type ReactNode, useId } from "react"
import { cx } from "../../cx.ts"
import styles from "./Switch.module.css"

export interface SwitchProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: ReactNode
  /** Secondary line under the label. */
  description?: ReactNode
}

/** An on/off setting drawn as a toggle; a native checkbox underneath. */
export function Switch({
  label,
  description,
  className,
  id,
  ...rest
}: SwitchProps) {
  const fallback = useId()
  const inputId = id ?? fallback
  const descId = description ? `${inputId}-desc` : undefined
  return (
    <span className={cx(styles.root, className)}>
      <span className={styles.text}>
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
        {description && (
          <span id={descId} className={styles.description}>
            {description}
          </span>
        )}
      </span>
      <span className={styles.control}>
        <input
          {...rest}
          id={inputId}
          type="checkbox"
          aria-describedby={descId}
          className={styles.input}
        />
        <span className={styles.track} aria-hidden="true">
          <span className={styles.thumb} />
        </span>
      </span>
    </span>
  )
}
