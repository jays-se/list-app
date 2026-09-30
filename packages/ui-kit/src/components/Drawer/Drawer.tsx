import { type ReactNode, useId, useRef } from "react"
import { cx } from "../../cx.ts"
import { DismissIcon } from "../../icons/index.tsx"
import { Button } from "../Button/Button.tsx"
import { useModal } from "../Dialog/use-modal.ts"
import styles from "./Drawer.module.css"

export interface DrawerProps {
  open: boolean
  /** Called on Esc, backdrop click or the close button. */
  onRequestClose: () => void
  title: ReactNode
  /** Small text under the title (e.g. status). */
  subtitle?: ReactNode
  footer?: ReactNode
  size?: "medium" | "large"
  children: ReactNode
}

/** Modal side sheet (native <dialog>, WAI-ARIA dialog pattern). */
export function Drawer({
  open,
  onRequestClose,
  title,
  subtitle,
  footer,
  size = "medium",
  children,
}: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useModal(ref, open, onRequestClose)
  return (
    <dialog
      ref={ref}
      className={cx(styles.drawer, styles[size])}
      aria-labelledby={titleId}
      aria-modal="true"
    >
      {open && (
        <div className={styles.surface}>
          <header className={styles.header}>
            <div className={styles.headings}>
              <h2 id={titleId} className={styles.title}>
                {title}
              </h2>
              {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
            </div>
            <Button
              appearance="subtle"
              icon={<DismissIcon />}
              aria-label="Close"
              onClick={onRequestClose}
            />
          </header>
          <div className={styles.body}>{children}</div>
          {footer && <footer className={styles.footer}>{footer}</footer>}
        </div>
      )}
    </dialog>
  )
}
