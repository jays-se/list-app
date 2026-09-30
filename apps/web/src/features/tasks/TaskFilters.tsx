import type { TaskFiltersVM } from "@app/protocol"
import { Button, Checkbox, Select } from "@app/ui-kit"
import { useId } from "react"
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
  const ids = {
    status: useId(),
    assignee: useId(),
    label: useId(),
    client: useId(),
  }
  return (
    <section
      key={search.toString()}
      className={styles.bar}
      aria-label="Filters"
    >
      <span className={styles.item}>
        <label htmlFor={ids.status} className={styles.label}>
          Status
        </label>
        <Select
          id={ids.status}
          size="small"
          defaultValue={value("status")}
          onChange={(e) => onChange("status", e.target.value)}
        >
          {filters.statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </span>
      <span className={styles.item}>
        <label htmlFor={ids.assignee} className={styles.label}>
          Assignee
        </label>
        <Select
          id={ids.assignee}
          size="small"
          defaultValue={mine ? "" : value("assigneeId")}
          disabled={mine}
          onChange={(e) => onChange("assigneeId", e.target.value)}
        >
          {filters.assigneeOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </span>
      <span className={styles.item}>
        <label htmlFor={ids.label} className={styles.label}>
          Label
        </label>
        <Select
          id={ids.label}
          size="small"
          defaultValue={value("labelId")}
          onChange={(e) => onChange("labelId", e.target.value)}
        >
          {filters.labelOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </span>
      <span className={styles.item}>
        <label htmlFor={ids.client} className={styles.label}>
          Client
        </label>
        <Select
          id={ids.client}
          size="small"
          defaultValue={value("clientId")}
          onChange={(e) => onChange("clientId", e.target.value)}
        >
          {filters.clientOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
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
