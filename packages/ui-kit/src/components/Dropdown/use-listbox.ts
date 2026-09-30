import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import type { DropdownOption } from "./Dropdown.tsx"

/** Typeahead / filter match on the option's visible label. */
export function matches(option: DropdownOption, text: string): boolean {
  const q = text.trim().toLowerCase()
  if (!q) return true
  return `${option.label} ${option.description ?? ""}`.toLowerCase().includes(q)
}

interface ListboxOptions<V extends string> {
  options: DropdownOption<V>[]
  /** Values shown as selected (one for single, many for multi). */
  selected: V[]
  searchable: boolean
  /** Called for Enter/Space/click on an option. Return true to close. */
  onPick: (value: V) => boolean
  disabled: boolean
}

/**
 * Select-only combobox behaviour (WAI-ARIA APG): the trigger (or the filter
 * box, when searchable) owns focus and points at the active option with
 * aria-activedescendant. Shared by Dropdown and MultiDropdown.
 */
export function useListbox<V extends string>({
  options,
  selected,
  searchable,
  onPick,
  disabled,
}: ListboxOptions<V>) {
  const id = useId()
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [filter, setFilter] = useState("")
  const typed = useRef({ text: "", at: 0 })

  const visible = searchable
    ? options.filter((o) => matches(o, filter))
    : options
  const listId = `${id}-list`
  const optionId = (i: number) => `${id}-opt-${i}`

  const enabledFrom = useCallback(
    (start: number, step: 1 | -1) => {
      for (let i = start; i >= 0 && i < visible.length; i += step) {
        if (!visible[i]?.disabled) return i
      }
      return -1
    },
    [visible]
  )

  const openList = (at?: "first" | "last") => {
    if (disabled) return
    const current = visible.findIndex((o) => selected.includes(o.value))
    setActive(
      at === "last"
        ? enabledFrom(visible.length - 1, -1)
        : at === "first" || current < 0
          ? enabledFrom(0, 1)
          : current
    )
    setFilter("")
    setOpen(true)
  }

  const close = useCallback((refocus = true) => {
    setOpen(false)
    setFilter("")
    if (refocus) triggerRef.current?.focus()
  }, [])

  const dismiss = useCallback(() => close(false), [close])

  useEffect(() => {
    if (open && searchable) searchRef.current?.focus()
  }, [open, searchable])

  useEffect(() => {
    if (!open || active < 0) return
    const el = document.getElementById(`${id}-opt-${active}`)
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest" })
    }
  }, [open, active, id])

  const pick = (index: number) => {
    const option = visible[index]
    if (!option || option.disabled) return
    if (onPick(option.value)) close()
  }

  /** Jump to the next option whose label starts with what was typed. */
  const typeahead = (key: string) => {
    const now = Date.now()
    const text = now - typed.current.at < 600 ? typed.current.text + key : key
    typed.current = { text, at: now }
    const lower = text.toLowerCase()
    const from = active + (text.length === 1 ? 1 : 0)
    const order = [...visible.keys()].map((i) => (i + from) % visible.length)
    const hit = order.find(
      (i) =>
        !visible[i]?.disabled &&
        visible[i]?.label.toLowerCase().startsWith(lower)
    )
    if (hit !== undefined) setActive(hit)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    if (disabled) return
    const fromSearch = e.target === searchRef.current
    if (!open) {
      if (["ArrowDown", "Enter", " "].includes(e.key)) {
        e.preventDefault()
        openList()
      } else if (e.key === "ArrowUp") {
        e.preventDefault()
        openList("last")
      } else if (e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
        openList()
        typeahead(e.key)
      }
      return
    }
    switch (e.key) {
      case "ArrowDown": {
        e.preventDefault()
        const next = enabledFrom(active + 1, 1)
        if (next >= 0) setActive(next)
        return
      }
      case "ArrowUp": {
        e.preventDefault()
        const prev = enabledFrom(Math.max(0, active - 1), -1)
        if (prev >= 0) setActive(prev)
        return
      }
      case "Home":
        if (fromSearch) return
        e.preventDefault()
        setActive(enabledFrom(0, 1))
        return
      case "End":
        if (fromSearch) return
        e.preventDefault()
        setActive(enabledFrom(visible.length - 1, -1))
        return
      case "Enter":
        e.preventDefault()
        pick(active)
        return
      case " ":
        if (fromSearch) return
        e.preventDefault()
        pick(active)
        return
      case "Escape":
        e.preventDefault()
        e.stopPropagation()
        close()
        return
      case "Tab":
        close(false)
        return
      default:
        if (!fromSearch && e.key.length === 1 && !e.metaKey && !e.ctrlKey) {
          typeahead(e.key)
        }
    }
  }

  return {
    id,
    listId,
    optionId,
    triggerRef,
    panelRef,
    searchRef,
    open,
    active,
    setActive,
    filter,
    setFilter: (text: string) => {
      setFilter(text)
      setActive(0)
    },
    visible,
    openList,
    close,
    dismiss,
    pick,
    onKeyDown,
  }
}
