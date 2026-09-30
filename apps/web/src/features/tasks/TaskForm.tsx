import type {
  PersonVM,
  ProtocolError,
  TaskDraft,
  TaskFormOptionsVM,
} from "@app/protocol"
import { Field, Input, Textarea } from "@app/ui-kit"
import { fieldError, formError } from "./draft.ts"
import {
  DueField,
  LabelPicker,
  OptionPicker,
  PeoplePicker,
} from "./pickers.tsx"
import styles from "./TaskForm.module.css"

interface TaskFormProps {
  draft: TaskDraft
  onChange: (next: TaskDraft) => void
  options: TaskFormOptionsVM
  error: ProtocolError | undefined
  /** Members who can be owners; omit to hide the owners picker. */
  ownerCandidates?: PersonVM[] | undefined
  autoFocusTitle?: boolean
}

/**
 * Title and description first, then a property sheet (Jira-style): each
 * row is a label and an inline dropdown or date.
 */
export function TaskForm({
  draft,
  onChange,
  options,
  error,
  ownerCandidates,
  autoFocusTitle = false,
}: TaskFormProps) {
  const set = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <div className={styles.form}>
      <div className={styles.main}>
        <Field
          label="Title"
          validationMessage={fieldError(error, "title")}
          required
        >
          <Input
            value={draft.title}
            maxLength={500}
            size="large"
            placeholder="What needs to be done?"
            autoFocus={autoFocusTitle}
            className={styles.title}
            onChange={(e) => set("title", e.target.value)}
          />
        </Field>
        <Field label="Description">
          <Textarea
            rows={4}
            value={draft.description}
            placeholder="Add details, links or acceptance criteria…"
            onChange={(e) => set("description", e.target.value)}
          />
        </Field>
      </div>

      <section className={styles.sheet} aria-label="Details">
        <OptionPicker
          label="Status"
          options={options.statusOptions}
          value={draft.status}
          onChange={(v) => set("status", v)}
        />
        <OptionPicker
          label="Priority"
          shape="flag"
          options={options.priorityOptions}
          value={draft.priority}
          onChange={(v) => set("priority", v)}
        />
        <PeoplePicker
          label="Assignees"
          people={options.members}
          emptyText="No members yet"
          selected={draft.assigneeIds}
          onChange={(ids) => set("assigneeIds", ids)}
          error={
            fieldError(error, "userIds") ?? fieldError(error, "assigneeIds")
          }
        />
        {ownerCandidates && (
          <PeoplePicker
            label="Owners"
            hint="Owners can edit this task and approve or reject requests."
            people={ownerCandidates}
            emptyText="Invite teammates to add owners"
            selected={draft.ownerIds}
            onChange={(ids) => set("ownerIds", ids)}
          />
        )}
        <LabelPicker
          labels={options.labels}
          selected={draft.labelIds}
          onChange={(ids) => set("labelIds", ids)}
        />
        <OptionPicker
          label="Client"
          options={options.clientOptions}
          value={draft.clientId}
          onChange={(v) => set("clientId", v)}
          error={fieldError(error, "clientId")}
        />
        <Field
          label="Start"
          validationMessage={fieldError(error, "startDate")}
          required
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
          validationMessage={fieldError(error, "endDate")}
          required
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
          presets={options.duePresets}
          error={fieldError(error, "dueDate")}
          onChange={(v) => set("dueDate", v)}
        />
      </section>

      {formError(error) && (
        <p role="alert" className={styles.error}>
          {formError(error)}
        </p>
      )}
    </div>
  )
}
