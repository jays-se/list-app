import { cx } from "../../cx.ts"
import styles from "./Avatar.module.css"

export interface AvatarProps {
  /** Accessible name; initials are derived from it when there's no image. */
  name: string
  image?: string | undefined
  size?: 20 | 24 | 32 | 40 | 48
  className?: string
}

/** Presentation-only: first letters of the first and last words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  const first = words[0]?.[0] ?? ""
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : ""
  return (first + last).toUpperCase()
}

export function Avatar({ name, image, size = 32, className }: AvatarProps) {
  return (
    <span
      role="img"
      aria-label={name}
      className={cx(styles.root, className)}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}
    >
      {image ? (
        <img className={styles.image} src={image} alt="" />
      ) : (
        <span aria-hidden="true">{initials(name)}</span>
      )}
    </span>
  )
}
