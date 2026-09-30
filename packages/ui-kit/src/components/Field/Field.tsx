import { createContext, type ReactNode, useContext, useId } from "react"
import { cx } from "../../cx.ts"
import styles from "./Field.module.css"

export type ValidationState = "none" | "error" | "warning" | "success"

interface FieldContextValue {
  id: string
  describedBy: string | undefined
  invalid: boolean
  required: boolean
}

const FieldContext = createContext<FieldContextValue | null>(null)

/** Controls read this to wire id / aria-describedby / aria-invalid. */
export function useFieldControl() {
  return useContext(FieldContext)
}

export interface FieldProps {
  label: ReactNode
  hint?: ReactNode
  validationMessage?: ReactNode
  validationState?: ValidationState
  required?: boolean
  orientation?: "vertical" | "horizontal"
  className?: string
  children: ReactNode
}

/**
 * Label + control + hint + validation message, with ARIA wiring handled for
 * any ui-kit control placed inside.
 */
export function Field({
  label,
  hint,
  validationMessage,
  validationState = validationMessage ? "error" : "none",
  required = false,
  orientation = "vertical",
  className,
  children,
}: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const messageId = validationMessage ? `${id}-message` : undefined
  const describedBy = [messageId, hintId].filter(Boolean).join(" ") || undefined
  const value: FieldContextValue = {
    id: `${id}-control`,
    describedBy,
    invalid: validationState === "error",
    required,
  }
  return (
    <div className={cx(styles.root, styles[orientation], className)}>
      <label className={styles.label} htmlFor={value.id}>
        {label}
        {required && (
          <span className={styles.required} aria-hidden="true">
            {" *"}
          </span>
        )}
      </label>
      <FieldContext.Provider value={value}>{children}</FieldContext.Provider>
      {validationMessage && (
        <span
          id={messageId}
          className={cx(styles.message, styles[validationState])}
          role={validationState === "error" ? "alert" : undefined}
        >
          {validationMessage}
        </span>
      )}
      {hint && (
        <span id={hintId} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  )
}
