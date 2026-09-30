import type { ReactNode } from "react"
import styles from "./Dropdown.module.css"
import { type DropdownBaseProps, isSearchable, Trigger } from "./Dropdown.tsx"
import { useListbox } from "./use-listbox.ts"

export interface MultiDropdownProps<V extends string>
  extends DropdownBaseProps<V> {
  value: V[]
  onChange: (value: V[]) => void
  /** How many selected items to show before "+N". Default 2. */
  maxShown?: number
  /** Custom rendering of the selection (e.g. label chips). */
  renderValue?: (selected: V[]) => ReactNode
}

/**
 * Multi-select variant of Dropdown: the list stays open while toggling
 * (Enter/Space/click), and the trigger summarises the selection.
 */
export function MultiDropdown<V extends string>(props: MultiDropdownProps<V>) {
  const { options, value, onChange, maxShown = 2 } = props
  const lb = useListbox({
    options,
    selected: value,
    searchable: isSearchable(props),
    disabled: Boolean(props.disabled),
    onPick: (picked) => {
      onChange(
        value.includes(picked)
          ? value.filter((v) => v !== picked)
          : // Keep the options' order so values compare stably.
            options
              .map((o) => o.value)
              .filter((v) => v === picked || value.includes(v))
      )
      return false
    },
  })
  const chosen = options.filter((o) => value.includes(o.value))
  const extra = chosen.length - maxShown
  return (
    <Trigger
      props={props}
      lb={lb}
      filled={chosen.length > 0}
      multiple
      selected={value}
    >
      {chosen.length === 0 ? (
        <span className={styles.placeholder}>
          {props.placeholder ?? "None"}
        </span>
      ) : props.renderValue ? (
        props.renderValue(value)
      ) : (
        <span className={styles.tokens}>
          {chosen.slice(0, maxShown).map((o) => (
            <span key={o.value} className={styles.token}>
              {o.media && <span className={styles.media}>{o.media}</span>}
              <span className={styles.value}>{o.label}</span>
            </span>
          ))}
          {extra > 0 && <span className={styles.more}>+{extra}</span>}
        </span>
      )}
    </Trigger>
  )
}
