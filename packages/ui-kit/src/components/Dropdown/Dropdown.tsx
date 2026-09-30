import type { ReactNode } from "react"
import { cx } from "../../cx.ts"
import { ChevronDownIcon } from "../../icons/index.tsx"
import { useFieldControl } from "../Field/Field.tsx"
import styles from "./Dropdown.module.css"
import { ListboxPanel } from "./ListboxPanel.tsx"
import { useListbox } from "./use-listbox.ts"

export interface DropdownOption<V extends string = string> {
  value: V
  label: string
  description?: string | undefined
  /** Leading visual: an icon, avatar or colour dot. */
  media?: ReactNode
  disabled?: boolean | undefined
}

export interface DropdownBaseProps<V extends string> {
  options: DropdownOption<V>[]
  size?: "small" | "medium" | "large"
  /** `subtle` has no border until hovered: for inline property rows. */
  appearance?: "outline" | "filled" | "subtle"
  disabled?: boolean | undefined
  placeholder?: string
  id?: string
  "aria-label"?: string
  "aria-describedby"?: string
  /** Adds a filter box. Default: on when there are more than 8 options. */
  searchable?: boolean
  emptyText?: string
  className?: string | undefined
}

export interface DropdownProps<V extends string> extends DropdownBaseProps<V> {
  value: V
  onChange: (value: V) => void
}

/**
 * A styled single-select: button + popover listbox (WAI-ARIA select-only
 * combobox). Arrow keys, Home/End, typeahead, Enter/Space and Esc work as
 * in a native <select>. Use inside a <Field> for the label and messages.
 */
export function Dropdown<V extends string>(props: DropdownProps<V>) {
  const { options, value, onChange } = props
  const lb = useListbox({
    options,
    selected: [value],
    searchable: isSearchable(props),
    disabled: Boolean(props.disabled),
    onPick: (next) => {
      if (next !== value) onChange(next)
      return true
    },
  })
  const current = options.find((o) => o.value === value)
  return (
    <Trigger props={props} lb={lb} filled={Boolean(current)} selected={[value]}>
      {current ? (
        <>
          {current.media && (
            <span className={styles.media}>{current.media}</span>
          )}
          <span className={styles.value}>{current.label}</span>
        </>
      ) : (
        <span className={styles.placeholder}>
          {props.placeholder ?? "Select…"}
        </span>
      )}
    </Trigger>
  )
}

export const isSearchable = (p: DropdownBaseProps<string>) =>
  p.searchable ?? p.options.length > 8

/** @internal The combobox button + panel shared with MultiDropdown. */
export function Trigger<V extends string>({
  props,
  lb,
  filled,
  multiple = false,
  selected,
  children,
}: {
  props: DropdownBaseProps<V>
  lb: ReturnType<typeof useListbox<V>>
  filled: boolean
  multiple?: boolean
  selected?: string[]
  children: ReactNode
}) {
  const field = useFieldControl()
  const describedBy =
    [field?.describedBy, props["aria-describedby"]].filter(Boolean).join(" ") ||
    undefined
  const searchable = isSearchable(props)
  const activeId =
    lb.open && !searchable && lb.active >= 0
      ? lb.optionId(lb.active)
      : undefined
  const size = props.size ?? "medium"
  return (
    <span className={cx(styles.root, props.className)}>
      <button
        ref={lb.triggerRef}
        type="button"
        role="combobox"
        id={props.id ?? field?.id}
        aria-label={props["aria-label"]}
        aria-describedby={describedBy}
        aria-invalid={field?.invalid || undefined}
        aria-required={field?.required || undefined}
        aria-haspopup="listbox"
        aria-expanded={lb.open}
        aria-controls={lb.open ? lb.listId : undefined}
        aria-activedescendant={activeId}
        disabled={props.disabled}
        data-filled={filled || undefined}
        className={cx(
          styles.trigger,
          styles[size],
          styles[props.appearance ?? "outline"]
        )}
        onClick={() => (lb.open ? lb.close() : lb.openList())}
        onKeyDown={lb.onKeyDown}
      >
        <span className={styles.content}>{children}</span>
        <span className={styles.chevron} aria-hidden="true">
          <ChevronDownIcon size={16} />
        </span>
      </button>
      <ListboxPanel
        lb={lb as never}
        selected={selected ?? []}
        multiple={multiple}
        searchable={searchable}
        label={props["aria-label"]}
        labelledBy={props["aria-label"] ? undefined : field?.labelId}
        emptyText={props.emptyText ?? "No matches"}
      />
    </span>
  )
}
