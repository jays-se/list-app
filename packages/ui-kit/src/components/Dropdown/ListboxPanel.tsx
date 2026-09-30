import { cx } from "../../cx.ts"
import { CheckmarkIcon, SearchIcon } from "../../icons/index.tsx"
import popover from "../Popover/Popover.module.css"
import {
  POPOVER_ATTR,
  useAnchoredPopover,
} from "../Popover/use-anchored-popover.ts"
import styles from "./Dropdown.module.css"
import type { DropdownOption } from "./Dropdown.tsx"
import type { useListbox } from "./use-listbox.ts"

type Listbox = ReturnType<typeof useListbox<string>>

/** The floating list of options (and the optional filter box). */
export function ListboxPanel({
  lb,
  selected,
  multiple,
  label,
  labelledBy,
  emptyText,
  searchable,
}: {
  lb: Listbox
  selected: string[]
  multiple: boolean
  searchable: boolean
  label: string | undefined
  labelledBy: string | undefined
  emptyText: string
}) {
  useAnchoredPopover({
    open: lb.open,
    anchorRef: lb.triggerRef,
    panelRef: lb.panelRef,
    onDismiss: lb.dismiss,
  })
  if (!lb.open) return null
  return (
    <div
      ref={lb.panelRef}
      popover={POPOVER_ATTR}
      data-popover=""
      className={cx(popover.panel, styles.panel)}
    >
      {searchable && <SearchBox lb={lb} label={label} />}
      <div
        role="listbox"
        id={lb.listId}
        aria-label={labelledBy ? undefined : label}
        aria-labelledby={labelledBy}
        aria-multiselectable={multiple || undefined}
        tabIndex={-1}
        className={styles.list}
      >
        {lb.visible.length === 0 && (
          <div className={styles.empty}>{emptyText}</div>
        )}
        {lb.visible.map((o: DropdownOption, i: number) => {
          const isSelected = selected.includes(o.value)
          return (
            // Focus stays on the trigger/filter (aria-activedescendant),
            // so options are pointer targets only.
            // biome-ignore lint/a11y/useKeyWithClickEvents: keys handled by the combobox
            <div
              key={o.value}
              id={lb.optionId(i)}
              role="option"
              tabIndex={-1}
              aria-selected={isSelected}
              aria-disabled={o.disabled || undefined}
              className={cx(
                styles.option,
                i === lb.active && styles.activeOption,
                isSelected && styles.selectedOption,
                o.disabled && styles.disabledOption
              )}
              onPointerMove={() => i !== lb.active && lb.setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => lb.pick(i)}
            >
              <span className={styles.check} aria-hidden="true">
                {multiple ? (
                  <span
                    className={cx(styles.box, isSelected && styles.boxChecked)}
                  >
                    {isSelected && <CheckmarkIcon size={16} />}
                  </span>
                ) : (
                  isSelected && <CheckmarkIcon size={16} />
                )}
              </span>
              {o.media && <span className={styles.media}>{o.media}</span>}
              <span className={styles.optionText}>
                <span className={styles.optionLabel}>{o.label}</span>
                {o.description && (
                  <span className={styles.optionDescription}>
                    {o.description}
                  </span>
                )}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function SearchBox({ lb, label }: { lb: Listbox; label: string | undefined }) {
  const activeId = lb.active >= 0 ? lb.optionId(lb.active) : undefined
  return (
    <div className={styles.search}>
      <SearchIcon size={16} />
      <input
        ref={lb.searchRef}
        type="text"
        role="combobox"
        aria-expanded="true"
        aria-controls={lb.listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-label={label ? `Filter ${label.toLowerCase()}` : "Filter"}
        placeholder="Type to filter…"
        className={styles.searchInput}
        value={lb.filter}
        onChange={(e) => lb.setFilter(e.target.value)}
        onKeyDown={lb.onKeyDown}
      />
    </div>
  )
}
