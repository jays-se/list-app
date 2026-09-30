import type { HTMLAttributes } from "react"
import { cx } from "../../cx.ts"
import styles from "./Badge.module.css"

export type BadgeColor =
  | "brand"
  | "danger"
  | "warning"
  | "success"
  | "informative"
  | "subtle"

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  appearance?: "filled" | "tint" | "outline"
  color?: BadgeColor
  size?: "small" | "medium" | "large"
  shape?: "rounded" | "circular"
}

export function Badge({
  appearance = "tint",
  color = "brand",
  size = "medium",
  shape = "circular",
  className,
  ...rest
}: BadgeProps) {
  return (
    <span
      {...rest}
      className={cx(
        styles.root,
        styles[appearance],
        styles[color],
        styles[size],
        styles[shape],
        className
      )}
    />
  )
}
