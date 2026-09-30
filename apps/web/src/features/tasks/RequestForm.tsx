import type { ProtocolError, RequestDraft, TaskDetailVM } from "@app/protocol"
import { Field, Input } from "@app/ui-kit"
import { fieldError, formError } from "./draft.ts"
import { DueField, OptionPicker, PeoplePicker } from "./pickers.tsx"
import styles from "./TaskForm.module.css"

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
      <div className={styles.sheet}>
        <OptionPicker
          label="Status"
          hint={pending.status}
          error={fieldError(error, "status")}
          options={vm.options.statusOptions}
          value={draft.status}
          onChange={(v) => set("status", v)}
        />
        <Field
          label="Start"
          hint={pending.startDate}
          validationMessage={fieldError(error, "startDate")}
          orientation="horizontal"
          className={styles.property}
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
          orientation="horizontal"
          className={styles.property}
        >
          <Input
            type="date"
            value={draft.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </Field>
        <DueField
          value={draft.dueDate}
          presets={vm.options.duePresets}
          hint={pending.dueDate ?? undefined}
          error={fieldError(error, "dueDate")}
          onChange={(v) => set("dueDate", v)}
        />
        <PeoplePicker
          label="Assignees"
          hint={vm.pendingAssigneesText ?? undefined}
          people={vm.options.members}
          emptyText="No members yet"
          selected={draft.assigneeIds}
          onChange={(ids) => set("assigneeIds", ids)}
        />
      </div>
      {formError(error) && (
        <p role="alert" className={styles.error}>
          {formError(error)}
        </p>
      )}
    </div>
  )
}
