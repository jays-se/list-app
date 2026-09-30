import { type ReactNode, useId, useRef } from "react"
import { Button } from "../Button/Button.tsx"
import styles from "./Dialog.module.css"
import { useModal } from "./use-modal.ts"

export interface ConfirmDialogProps {
  open: boolean
  title: ReactNode
  children?: ReactNode
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onCancel: () => void
  pending?: boolean
}

/** Confirmation modal (WAI-ARIA alertdialog). Cancel gets initial focus. */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  pending = false,
}: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const bodyId = useId()
  useModal(ref, open, onCancel)
  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={children ? bodyId : undefined}
    >
      {open && (
        <div className={styles.surface}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          {children && (
            <div id={bodyId} className={styles.body}>
              {children}
            </div>
          )}
          <div className={styles.actions}>
            <Button autoFocus onClick={onCancel}>
              {cancelLabel}
            </Button>
            <Button appearance="primary" onClick={onConfirm} disabled={pending}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  )
}
