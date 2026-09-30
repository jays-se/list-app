import { useView } from "@app/bridge"
import type { SearchResultVM } from "@app/protocol"
import {
  BuildingIcon,
  ChevronRightIcon,
  cx,
  DocumentIcon,
  POPOVER_ATTR,
  popoverStyles,
  SearchIcon,
  Spinner,
  Swatch,
  useAnchoredPopover,
} from "@app/ui-kit"
import {
  type KeyboardEvent,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from "react"
import { Link, useSearchParams } from "react-router"
import styles from "./GlobalSearch.module.css"

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * Jira-style search in the top bar: `/` or ⌘K/Ctrl+K focuses it. Matching
 * and ranking run in the worker (`search.global`); this is the combobox.
 */
export function GlobalSearch() {
  const id = useId()
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const [text, setText] = useState("") // input draft
  const [query, setQuery] = useState("") // debounced
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = `${id}-results`
  const optionId = (i: number) => `${id}-r${i}`

  useEffect(() => {
    const t = setTimeout(() => setQuery(text), 120)
    return () => clearTimeout(t)
  }, [text])

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const typing =
        target?.closest("input, textarea, select, [contenteditable=true]") !==
        null
      const combo = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"
      if (combo || (e.key === "/" && !typing)) {
        e.preventDefault()
        inputRef.current?.focus()
        setOpen(true)
      }
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    setActive(0)
  }, [])

  useAnchoredPopover({
    open,
    anchorRef: wrapRef,
    panelRef,
    onDismiss: close,
  })

  const finish = () => {
    close()
    setText("")
    inputRef.current?.blur()
  }

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const total = Number(panelRef.current?.dataset.total ?? 0)
    if (e.key === "Escape") {
      e.preventDefault()
      if (open) close()
      else {
        setText("")
        inputRef.current?.blur()
      }
      return
    }
    if (!open && (e.key === "ArrowDown" || e.key === "Enter")) {
      setOpen(true)
      return
    }
    if (!total) return
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault()
      const next =
        e.key === "ArrowDown"
          ? (active + 1) % total
          : (active - 1 + total) % total
      setActive(next)
      document
        .getElementById(optionId(next))
        ?.scrollIntoView?.({ block: "nearest" })
    } else if (e.key === "Enter") {
      e.preventDefault()
      // Results are links; activating the highlighted one navigates.
      document.getElementById(optionId(active))?.click()
    }
  }

  return (
    <div ref={wrapRef} className={styles.root}>
      <SearchIcon size={16} className={styles.icon} />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-label="Search"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-activedescendant={open ? optionId(active) : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        spellCheck={false}
        placeholder="Search tasks, docs, clients…"
        className={styles.input}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          setActive(0)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      {!text && (
        <span className={styles.kbd} aria-hidden="true">
          {isMac ? "⌘K" : "Ctrl K"}
        </span>
      )}
      {open && (
        <div
          ref={panelRef}
          popover={POPOVER_ATTR}
          data-popover=""
          className={cx(popoverStyles.panel, styles.panel)}
        >
          <Results
            query={query}
            listId={listId}
            optionId={optionId}
            active={active}
            setActive={setActive}
            onPick={finish}
            panelRef={panelRef}
          />
        </div>
      )}
    </div>
  )
}

/** Only mounted while open, so the worker only searches on demand. */
function Results(props: {
  query: string
  listId: string
  optionId: (i: number) => string
  active: number
  setActive: (i: number) => void
  onPick: () => void
  panelRef: React.RefObject<HTMLDivElement | null>
}) {
  const [search] = useSearchParams()
  const view = useView(
    "search.global",
    { q: props.query },
    { keepPrevious: true }
  )
  const vm = view.data
  useEffect(() => {
    if (props.panelRef.current) {
      props.panelRef.current.dataset.total = String(vm?.total ?? 0)
    }
  }, [vm?.total, props.panelRef])

  if (!vm) {
    return view.error ? (
      <p className={styles.message} role="alert">
        {view.error.message}
      </p>
    ) : (
      <div className={styles.message}>
        <Spinner size="tiny" label="Searching" />
      </div>
    )
  }

  const hrefFor = (r: SearchResultVM) => {
    if (r.taskId) {
      const next = new URLSearchParams(search)
      next.delete("create")
      next.set("task", r.taskId)
      return { search: `?${next}` }
    }
    return r.to ?? "/"
  }

  let index = -1
  return (
    <div
      role="listbox"
      id={props.listId}
      aria-label="Search results"
      className={styles.list}
    >
      {vm.isEmpty && <p className={styles.message}>{vm.emptyText}</p>}
      {vm.groups.map((g) => (
        // Options inside a listbox are grouped with role="group".
        // biome-ignore lint/a11y/useSemanticElements: see above
        <div
          key={g.key}
          role="group"
          aria-labelledby={`${props.listId}-${g.key}`}
          className={styles.group}
        >
          <div id={`${props.listId}-${g.key}`} className={styles.groupLabel}>
            <span>{g.label}</span>
            {g.countText && <span>{g.countText}</span>}
          </div>
          {g.items.map((r) => {
            index++
            const i = index
            return (
              <Link
                key={r.key}
                id={props.optionId(i)}
                role="option"
                aria-selected={i === props.active}
                tabIndex={-1}
                to={hrefFor(r)}
                className={cx(styles.item, i === props.active && styles.active)}
                onPointerMove={() => i !== props.active && props.setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={props.onPick}
              >
                <span className={styles.itemIcon} aria-hidden="true">
                  <ResultIcon r={r} />
                </span>
                <span className={styles.itemText}>
                  <span className={styles.itemTitle}>{r.title}</span>
                  {r.subtitle && (
                    <span
                      className={cx(
                        styles.itemSub,
                        r.tone === "danger" && styles.danger
                      )}
                    >
                      {r.subtitle}
                    </span>
                  )}
                </span>
                <ChevronRightIcon size={16} className={styles.go} />
              </Link>
            )
          })}
        </div>
      ))}
    </div>
  )
}

function ResultIcon({ r }: { r: SearchResultVM }) {
  switch (r.kind) {
    case "task":
      return <Swatch color={r.color ?? "gray"} />
    case "doc":
      return <DocumentIcon size={16} />
    case "client":
      return <BuildingIcon size={16} />
    default:
      return <ChevronRightIcon size={16} />
  }
}
