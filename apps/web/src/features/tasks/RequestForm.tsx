import type { ProtocolError, RequestDraft, TaskDetailVM } from "@app/protocol"
import { Field, Input, Select } from "@app/ui-kit"
import { fieldError, formError, toggleId } from "./draft.ts"
import styles from "./TaskForm.module.css"
import { PeoplePicker } from "./TaskForm.tsx"

/**
 * Request mode (E5-S3): an assignee edits the requestable fields; the
 * worker turns each change into a request. Pending requests show as hints.
 */
export function RequestForm({
  vm,
  draft,
  onChange,
  error,
}: {
  vm: TaskDetailVM
  draft: RequestDraft
  onChange: (next: RequestDraft) => void
  error: ProtocolError | undefined
}) {
  const set = <K extends keyof RequestDraft>(key: K, value: RequestDraft[K]) =>
    onChange({ ...draft, [key]: value })
  const pending = vm.pendingFields
  return (
    <div className={styles.form}>
      <Field
        label="Status"
        hint={pending.status}
        validationMessage={fieldError(error, "status")}
      >
        <Select
          value={draft.status}
          onChange={(e) =>
            set("status", e.target.value as RequestDraft["status"])
          }
        >
          {vm.options.statusOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className={styles.row3}>
        <Field
          label="Start"
          hint={pending.startDate}
          validationMessage={fieldError(error, "startDate")}
        >
          <Input
            type="date"
            value={draft.startDate}
            onChange={(e) => set("startDate", e.target.value)}
          />
        </Field>
        <Field
          label="End"
          hint={pending.endDate}
          validationMessage={fieldError(error, "endDate")}
        >
          <Input
            type="date"
            value={draft.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </Field>
        <Field
          label="Due"
          hint={pending.dueDate ?? "Optional"}
          validationMessage={fieldError(error, "dueDate")}
        >
          <Input
            type="date"
            value={draft.dueDate}
            onChange={(e) => set("dueDate", e.target.value)}
          />
        </Field>
      </div>
      <PeoplePicker
        legend="Assignees"
        hint={vm.pendingAssigneesText ?? undefined}
        people={vm.options.members}
        emptyText="No members yet."
        selected={draft.assigneeIds}
        onToggle={(id) => set("assigneeIds", toggleId(draft.assigneeIds, id))}
      />
      {formError(error) && (
        <p role="alert" className={styles.error}>
          {formError(error)}
        </p>
      )}
    </div>
  )
}
