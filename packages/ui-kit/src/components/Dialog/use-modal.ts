import { type RefObject, useEffect } from "react"

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * Drives a native <dialog> as a modal: showModal() gives focus trapping,
 * Esc and an inert background (top layer). Esc/backdrop only *request*
 * closing via onRequestClose so callers can guard unsaved changes.
 * Falls back to the `open` attribute where showModal is missing (jsdom).
 */
export function useModal(
  ref: RefObject<HTMLDialogElement | null>,
  open: boolean,
  onRequestClose: () => void
) {
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (!open) {
      if (dialog.open) {
        if (typeof dialog.close === "function") dialog.close()
        else dialog.removeAttribute("open")
      }
      return
    }
    const previous = document.activeElement as HTMLElement | null
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal()
      else dialog.setAttribute("open", "")
    }
    const autofocus =
      dialog.querySelector<HTMLElement>("[autofocus]") ??
      dialog.querySelector<HTMLElement>(FOCUSABLE)
    autofocus?.focus()
    return () => previous?.focus?.()
  }, [ref, open])

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onRequestClose()
    }
    const onKey = (e: KeyboardEvent) => {
      // An open dropdown/menu inside the dialog handles its own Esc (this
      // native listener runs before React's handlers can stop it).
      const target = e.target as Element | null
      if (target?.closest?.('[aria-expanded="true"], [data-popover]')) return
      if (e.key === "Escape") {
        e.preventDefault()
        onRequestClose()
      }
    }
    // A click whose target is the <dialog> itself landed on the backdrop.
    const onClick = (e: MouseEvent) => {
      if (e.target === dialog) onRequestClose()
    }
    dialog.addEventListener("cancel", onCancel)
    dialog.addEventListener("keydown", onKey)
    dialog.addEventListener("click", onClick)
    return () => {
      dialog.removeEventListener("cancel", onCancel)
      dialog.removeEventListener("keydown", onKey)
      dialog.removeEventListener("click", onClick)
    }
  }, [ref, onRequestClose])
}
