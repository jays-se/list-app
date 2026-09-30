import { type InputHTMLAttributes, type ReactNode, useId } from "react"
import { cx } from "../../cx.ts"
import { CheckmarkIcon } from "../../icons/index.tsx"
import styles from "./Checkbox.module.css"

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "size"> {
  label?: ReactNode
  size?: "medium" | "large"
}

/** Native checkbox (keeps built-in a11y) with a token-styled indicator. */
export function Checkbox({
  label,
  size = "medium",
  className,
  id,
  ...rest
}: CheckboxProps) {
  const fallbackId = useId()
  const inputId = id ?? fallbackId
  return (
    <span className={cx(styles.root, styles[size], className)}>
      <input {...rest} id={inputId} type="checkbox" className={styles.input} />
      <span className={styles.indicator} aria-hidden="true">
        <CheckmarkIcon size={16} />
      </span>
      {label !== undefined && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
    </span>
  )
}
