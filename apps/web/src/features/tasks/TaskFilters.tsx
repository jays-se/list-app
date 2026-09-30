import type { TaskFiltersVM } from "@app/protocol"
import { Button, Checkbox, Dropdown } from "@app/ui-kit"
import { swatchOptions } from "./pickers.tsx"
import styles from "./TaskFilters.module.css"

type Key = "status" | "mine" | "assigneeId" | "labelId" | "clientId"

/**
 * The URL is the source of filter intent; the worker only supplies options.
 * Controls are uncontrolled (default* from the URL) and remount when the URL
 * changes (`key` below), so a click shows instantly even though a router
 * navigation commits a tick later.
 */
export function TaskFilters(props: {
  filters: TaskFiltersVM
  search: URLSearchParams
  onChange: (key: Key, value: string) => void
  onClear: () => void
}) {
  const { filters, search, onChange, onClear } = props
  const value = (key: Key) => search.get(key) ?? ""
  const mine = value("mine") === "true"
  const active = (
    ["status", "mine", "assigneeId", "labelId", "clientId"] as const
  ).some((k) => value(k))
  return (
    <section
      key={search.toString()}
      className={styles.bar}
      aria-label="Filters"
    >
      <span className={styles.item}>
        <Dropdown
          aria-label="Status"
          size="small"
          value={value("status")}
          options={swatchOptions(filters.statusOptions)}
          onChange={(v) => onChange("status", v)}
        />
      </span>
      <span className={styles.item}>
        <Dropdown
          aria-label="Assignee"
          size="small"
          value={mine ? "" : value("assigneeId")}
          disabled={mine}
          options={swatchOptions(filters.assigneeOptions)}
          onChange={(v) => onChange("assigneeId", v)}
        />
      </span>
      <span className={styles.item}>
        <Dropdown
          aria-label="Label"
          size="small"
          value={value("labelId")}
          options={swatchOptions(filters.labelOptions)}
          onChange={(v) => onChange("labelId", v)}
        />
      </span>
      <span className={styles.item}>
        <Dropdown
          aria-label="Client"
          size="small"
          value={value("clientId")}
          options={swatchOptions(filters.clientOptions)}
          onChange={(v) => onChange("clientId", v)}
        />
      </span>
      <Checkbox
        label="Assigned to me"
        defaultChecked={mine}
        onChange={(e) => onChange("mine", e.target.checked ? "true" : "")}
      />
      {active && (
        <Button appearance="transparent" size="small" onClick={onClear}>
          Clear filters
        </Button>
      )}
    </section>
  )
}
