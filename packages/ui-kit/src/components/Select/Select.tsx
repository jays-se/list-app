import type { SelectHTMLAttributes } from "react"
import { cx } from "../../cx.ts"
import { ChevronDownIcon } from "../../icons/index.tsx"
import { useFieldControl } from "../Field/Field.tsx"
import styles from "./Select.module.css"

export interface SelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> {
  size?: "small" | "medium" | "large"
  appearance?: "outline" | "filled"
}

/** Native <select> (full keyboard/AT support) with token styling. */
export function Select({
  size = "medium",
  appearance = "outline",
  className,
  children,
  ...rest
}: SelectProps) {
  const field = useFieldControl()
  const describedBy =
    [field?.describedBy, rest["aria-describedby"]].filter(Boolean).join(" ") ||
    undefined
  return (
    <span className={cx(styles.root, styles[size], className)}>
      <select
        {...rest}
        id={rest.id ?? field?.id}
        aria-describedby={describedBy}
        aria-invalid={rest["aria-invalid"] ?? (field?.invalid || undefined)}
        required={rest.required ?? field?.required}
        className={cx(styles.select, styles[appearance])}
      >
        {children}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronDownIcon size={16} />
      </span>
    </span>
  )
}
