import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
  ReactNode,
} from "react"
import { cx } from "../../cx.ts"
import styles from "./Button.module.css"

export type ButtonAppearance =
  | "primary"
  | "secondary"
  | "subtle"
  | "transparent"
export type ButtonSize = "small" | "medium" | "large"
export type ButtonShape = "rounded" | "circular" | "square"

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  appearance?: ButtonAppearance
  size?: ButtonSize
  shape?: ButtonShape
  icon?: ReactNode
  iconPosition?: "before" | "after"
}

export function Button({
  appearance = "secondary",
  size = "medium",
  shape = "rounded",
  icon,
  iconPosition = "before",
  className,
  children,
  type = "button",
  ...rest
}: ButtonProps) {
  const iconOnly =
    icon !== undefined && (children === undefined || children === null)
  const iconNode = icon ? <span className={styles.icon}>{icon}</span> : null
  return (
    <button
      type={type}
      className={cx(
        styles.root,
        styles[appearance],
        styles[size],
        styles[shape],
        iconOnly && styles.iconOnly,
        className
      )}
      {...rest}
    >
      {iconPosition === "before" && iconNode}
      {children}
      {iconPosition === "after" && iconNode}
    </button>
  )
}

export interface IconButtonProps
  extends Omit<ButtonProps, "children" | "icon" | "aria-label"> {
  icon: ReactNode
  /** Required: icon-only buttons need an accessible name. */
  "aria-label": string
}

export function IconButton(props: IconButtonProps) {
  return <Button {...props} />
}

export interface ButtonStyleOptions {
  appearance?: ButtonAppearance | undefined
  size?: ButtonSize | undefined
  shape?: ButtonShape | undefined
}

/** Button classes for other elements, e.g. a router <Link> styled as a button. */
export function buttonClass({
  appearance = "secondary",
  size = "medium",
  shape = "rounded",
}: ButtonStyleOptions = {}): string {
  return cx(
    styles.root,
    styles[appearance],
    styles[size],
    styles[shape],
    styles.link
  )
}

export interface LinkButtonProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>,
    ButtonStyleOptions {
  href: string
  icon?: ReactNode
}

/** An <a> that looks like a Button — for full-page navigations. */
export function LinkButton({
  appearance,
  size,
  shape,
  icon,
  className,
  children,
  ...rest
}: LinkButtonProps) {
  return (
    <a
      {...rest}
      className={cx(buttonClass({ appearance, size, shape }), className)}
    >
      {icon ? <span className={styles.icon}>{icon}</span> : null}
      {children}
    </a>
  )
}
