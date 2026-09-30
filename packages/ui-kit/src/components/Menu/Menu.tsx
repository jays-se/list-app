import {
  type KeyboardEvent,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { cx } from "../../cx.ts"
import { CheckmarkIcon } from "../../icons/index.tsx"
import popover from "../Popover/Popover.module.css"
import {
  POPOVER_ATTR,
  useAnchoredPopover,
} from "../Popover/use-anchored-popover.ts"
import styles from "./Menu.module.css"

export type MenuItem =
  | {
      kind?: "item"
      key: string
      label: string
      icon?: ReactNode
      /** Shown on the right, e.g. a keyboard shortcut. */
      hint?: string
      danger?: boolean
      disabled?: boolean
      onSelect: () => void
    }
  | {
      kind: "radio"
      key: string
      label: string
      icon?: ReactNode
      checked: boolean
      onSelect: () => void
    }
  | { kind: "separator"; key: string }
  | { kind: "group"; key: string; label: string }

export interface MenuTriggerProps {
  ref: Ref<HTMLButtonElement>
  id: string
  "aria-haspopup": "menu"
  "aria-expanded": boolean
  "aria-controls": string | undefined
  onClick: () => void
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void
}

export interface MenuProps {
  /** Render the button that opens the menu; spread the props onto it. */
  trigger: (props: MenuTriggerProps) => ReactNode
  items: MenuItem[]
  /** Accessible name of the menu. */
  label: string
  /** Non-interactive content above the items (e.g. who is signed in). */
  header?: ReactNode
  align?: "start" | "end"
}

type Actionable = Extract<MenuItem, { onSelect: () => void }>
const actionable = (i: MenuItem): i is Actionable =>
  i.kind !== "separator" &&
  i.kind !== "group" &&
  !("disabled" in i && i.disabled)

/**
 * WAI-ARIA menu button: Enter/Space/ArrowDown open on the first item,
 * ArrowUp on the last; arrows, Home/End and typeahead move; Esc closes
 * and returns focus to the button.
 */
export function Menu({
  trigger,
  items,
  label,
  header,
  align = "start",
}: MenuProps) {
  const id = useId()
  const buttonRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef<(HTMLElement | null)[]>([])
  const [open, setOpen] = useState(false)
  const [focusAt, setFocusAt] = useState<"first" | "last">("first")
  const menuId = `${id}-menu`

  const close = useCallback((refocus = true) => {
    setOpen(false)
    if (refocus) buttonRef.current?.focus()
  }, [])
  const dismiss = useCallback(() => close(false), [close])

  useAnchoredPopover({
    open,
    anchorRef: buttonRef,
    panelRef,
    onDismiss: dismiss,
    align,
    matchWidth: false,
  })

  const enabled = () =>
    items.map((item, i) => (actionable(item) ? i : -1)).filter((i) => i >= 0)

  // Only on open; `enabled` reads the current items.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see above
  useEffect(() => {
    if (!open) return
    const list = enabled()
    const target = focusAt === "last" ? list.at(-1) : list[0]
    if (target !== undefined) itemRefs.current[target]?.focus()
  }, [open, focusAt])

  const openMenu = (at: "first" | "last") => {
    setFocusAt(at)
    setOpen(true)
  }

  const onTriggerKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ") {
      e.preventDefault()
      openMenu("first")
    } else if (e.key === "ArrowUp") {
      e.preventDefault()
      openMenu("last")
    }
  }

  const onMenuKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const list = enabled()
    const current = itemRefs.current.indexOf(
      document.activeElement as HTMLElement
    )
    const pos = list.indexOf(current)
    const focus = (i: number | undefined) => {
      if (i !== undefined) itemRefs.current[i]?.focus()
    }
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault()
        return focus(list[(pos + 1) % list.length])
      case "ArrowUp":
        e.preventDefault()
        return focus(list[(pos - 1 + list.length) % list.length])
      case "Home":
        e.preventDefault()
        return focus(list[0])
      case "End":
        e.preventDefault()
        return focus(list.at(-1))
      case "Escape":
        e.preventDefault()
        e.stopPropagation()
        return close()
      case "Tab":
        return close(false)
      default: {
        if (e.key.length !== 1) return
        const key = e.key.toLowerCase()
        const order = [...list.slice(pos + 1), ...list.slice(0, pos + 1)]
        focus(
          order.find((i) => {
            const item = items[i]
            return (
              item &&
              "label" in item &&
              item.label.toLowerCase().startsWith(key)
            )
          })
        )
      }
    }
  }

  const select = (item: Actionable) => {
    close()
    item.onSelect()
  }

  return (
    <>
      {trigger({
        ref: buttonRef,
        id: `${id}-button`,
        "aria-haspopup": "menu",
        "aria-expanded": open,
        "aria-controls": open ? menuId : undefined,
        onClick: () => (open ? close() : openMenu("first")),
        onKeyDown: onTriggerKeyDown,
      })}
      {open && (
        <div
          ref={panelRef}
          popover={POPOVER_ATTR}
      data-popover=""
          className={cx(popover.panel, styles.panel)}
        >
          {header && <div className={styles.header}>{header}</div>}
          <div
            role="menu"
            id={menuId}
            aria-label={label}
            tabIndex={-1}
            className={styles.menu}
            onKeyDown={onMenuKeyDown}
          >
            {items.map((item, i) => {
              if (item.kind === "separator") {
                return <hr key={item.key} className={styles.separator} />
              }
              if (item.kind === "group") {
                return (
                  <div
                    key={item.key}
                    role="presentation"
                    className={styles.group}
                  >
                    {item.label}
                  </div>
                )
              }
              const ref = (el: HTMLButtonElement | null) => {
                itemRefs.current[i] = el
              }
              if (item.kind === "radio") {
                return (
                  <button
                    key={item.key}
                    ref={ref}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.checked}
                    tabIndex={-1}
                    className={styles.item}
                    onClick={() => select(item)}
                  >
                    <span className={styles.icon} aria-hidden="true">
                      {item.checked && <CheckmarkIcon size={16} />}
                    </span>
                    <span className={styles.label}>{item.label}</span>
                  </button>
                )
              }
              return (
                <button
                  key={item.key}
                  ref={ref}
                  type="button"
                  role="menuitem"
                  aria-disabled={item.disabled || undefined}
                  tabIndex={-1}
                  className={cx(
                    styles.item,
                    item.danger && styles.danger,
                    item.disabled && styles.disabled
                  )}
                  onClick={() => !item.disabled && select(item)}
                >
                  <span className={styles.icon} aria-hidden="true">
                    {item.icon}
                  </span>
                  <span className={styles.label}>{item.label}</span>
                  {item.hint && (
                    <span className={styles.hint}>{item.hint}</span>
                  )}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </>
  )
}
