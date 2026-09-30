import { type RefObject, useEffect, useLayoutEffect } from "react"

export interface AnchoredPopoverOptions {
  open: boolean
  anchorRef: RefObject<HTMLElement | null>
  panelRef: RefObject<HTMLElement | null>
  /** Outside pointer-down, scroll away, etc. Esc is left to the caller. */
  onDismiss: () => void
  /** Align the panel's start or end edge with the anchor's. */
  align?: "start" | "end"
  /** Make the panel at least as wide as the anchor. */
  matchWidth?: boolean
  gap?: number
}

type PopoverElement = HTMLElement & {
  showPopover?: () => void
  hidePopover?: () => void
}

/**
 * `popover="manual"` where supported; omitted elsewhere (jsdom hides
 * un-shown popovers but can't show them), so the panel renders in place.
 */
export const POPOVER_ATTR: "manual" | undefined =
  typeof HTMLElement !== "undefined" && "showPopover" in HTMLElement.prototype
    ? "manual"
    : undefined

const isOpen = (el: HTMLElement) => {
  try {
    return el.matches(":popover-open")
  } catch {
    return false
  }
}

/**
 * Positions a `popover="manual"` panel next to its anchor. The popover API
 * puts it in the top layer, so it is never clipped by a drawer's overflow
 * and stays above a modal <dialog>. Where the API is missing (jsdom) the
 * panel simply renders in place.
 */
export function useAnchoredPopover({
  open,
  anchorRef,
  panelRef,
  onDismiss,
  align = "start",
  matchWidth = true,
  gap = 4,
}: AnchoredPopoverOptions) {
  useLayoutEffect(() => {
    const panel = panelRef.current as PopoverElement | null
    const anchor = anchorRef.current
    if (!open || !panel || !anchor) return
    if (typeof panel.showPopover === "function" && !isOpen(panel)) {
      panel.showPopover()
    }
    const place = () => {
      const a = anchor.getBoundingClientRect()
      const vw = window.innerWidth
      const vh = window.innerHeight
      if (matchWidth) panel.style.minWidth = `${a.width}px`
      const p = panel.getBoundingClientRect()
      const below = vh - a.bottom - gap
      const above = a.top - gap
      const up = p.height > below && above > below
      const top = up ? Math.max(8, a.top - gap - p.height) : a.bottom + gap
      const maxHeight = Math.max(160, (up ? above : below) - 8)
      let left = align === "end" ? a.right - p.width : a.left
      left = Math.min(Math.max(8, left), Math.max(8, vw - p.width - 8))
      panel.style.top = `${top}px`
      panel.style.left = `${left}px`
      panel.style.maxHeight = `${maxHeight}px`
    }
    place()
    window.addEventListener("resize", place)
    window.addEventListener("scroll", place, true)
    return () => {
      window.removeEventListener("resize", place)
      window.removeEventListener("scroll", place, true)
      if (typeof panel.hidePopover === "function" && isOpen(panel)) {
        panel.hidePopover()
      }
    }
  }, [open, anchorRef, panelRef, align, matchWidth, gap])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (anchorRef.current?.contains(target)) return
      if (panelRef.current?.contains(target)) return
      onDismiss()
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true)
  }, [open, anchorRef, panelRef, onDismiss])
}
