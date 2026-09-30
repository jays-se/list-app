import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react"
import { cx } from "../../cx.ts"
import { useFieldControl } from "../Field/Field.tsx"
import styles from "./Input.module.css"

type Size = "small" | "medium" | "large"

function useControlProps(props: {
  id?: string | undefined
  "aria-describedby"?: string | undefined
  "aria-invalid"?: InputHTMLAttributes<HTMLInputElement>["aria-invalid"]
  required?: boolean | undefined
}) {
  const field = useFieldControl()
  const describedBy =
    [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") ||
    undefined
  return {
    id: props.id ?? field?.id,
    "aria-describedby": describedBy,
    "aria-invalid": props["aria-invalid"] ?? (field?.invalid || undefined),
    required: props.required ?? field?.required,
  }
}

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  size?: Size
  appearance?: "outline" | "filled"
}

export function Input({
  size = "medium",
  appearance = "outline",
  className,
  ...rest
}: InputProps) {
  const control = useControlProps(rest)
  return (
    <input
      {...rest}
      {...control}
      className={cx(
        styles.control,
        styles[size],
        styles[appearance],
        className
      )}
    />
  )
}

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  resize?: "none" | "vertical" | "both"
  appearance?: "outline" | "filled"
}

export function Textarea({
  resize = "vertical",
  appearance = "outline",
  className,
  ...rest
}: TextareaProps) {
  const control = useControlProps(rest)
  return (
    <textarea
      {...rest}
      {...control}
      className={cx(
        styles.control,
        styles.textarea,
        styles[appearance],
        className
      )}
      style={{ resize, ...rest.style }}
    />
  )
}
