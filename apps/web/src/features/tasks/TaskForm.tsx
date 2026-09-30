import type {
  PersonVM,
  ProtocolError,
  TaskDraft,
  TaskFormOptionsVM,
} from "@app/protocol"
import {
  Avatar,
  Checkbox,
  Field,
  Input,
  LabelChip,
  Select,
  Textarea,
} from "@app/ui-kit"
import { useId } from "react"
import { fieldError, formError, toggleId } from "./draft.ts"
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
      <Field
        label="Title"
        validationMessage={fieldError(error, "title")}
        required
      >
        <Input
          value={draft.title}
          maxLength={500}
          autoFocus={autoFocusTitle}
          onChange={(e) => set("title", e.target.value)}
        />
      </Field>
      <Field label="Description">
        <Textarea
          rows={4}
          value={draft.description}
          onChange={(e) => set("description", e.target.value)}
        />
      </Field>
      <div className={styles.row}>
        <Field label="Status">
          <Select
            value={draft.status}
            onChange={(e) =>
              set("status", e.target.value as TaskDraft["status"])
            }
          >
            {options.statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={draft.priority}
            onChange={(e) =>
              set("priority", e.target.value as TaskDraft["priority"])
            }
          >
            {options.priorityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field label="Client" validationMessage={fieldError(error, "clientId")}>
        <Select
          value={draft.clientId}
          onChange={(e) => set("clientId", e.target.value)}
        >
          {options.clientOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      <div className={styles.row3}>
        <Field
          label="Start"
          validationMessage={fieldError(error, "startDate")}
          required
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
        >
          <Input
            type="date"
            value={draft.endDate}
            onChange={(e) => set("endDate", e.target.value)}
          />
        </Field>
        <Field
          label="Due"
          hint="Optional"
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
        people={options.members}
        emptyText="No members yet."
        selected={draft.assigneeIds}
        onToggle={(id) => set("assigneeIds", toggleId(draft.assigneeIds, id))}
        error={fieldError(error, "userIds") ?? fieldError(error, "assigneeIds")}
      />
      {ownerCandidates && (
        <PeoplePicker
          legend="Owners"
          hint="Owners can edit this task and approve or reject requests, like you."
          people={ownerCandidates}
          emptyText="Invite teammates to add owners."
          selected={draft.ownerIds}
          onToggle={(id) => set("ownerIds", toggleId(draft.ownerIds, id))}
        />
      )}

      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>Labels</legend>
        {options.labels.length === 0 ? (
          <p className={styles.muted}>
            No labels yet. Add them in workspace settings.
          </p>
        ) : (
          <div className={styles.choices}>
            {options.labels.map((l) => (
              <Checkbox
                key={l.id}
                checked={draft.labelIds.includes(l.id)}
                onChange={() => set("labelIds", toggleId(draft.labelIds, l.id))}
                label={<LabelChip color={l.color}>{l.name}</LabelChip>}
              />
            ))}
          </div>
        )}
      </fieldset>

      {formError(error) && (
        <p role="alert" className={styles.error}>
          {formError(error)}
        </p>
      )}
    </div>
  )
}

function PeoplePicker(props: {
  legend: string
  hint?: string
  people: PersonVM[]
  emptyText: string
  selected: string[]
  onToggle: (id: string) => void
  error?: string | undefined
}) {
  const hintId = useId()
  return (
    <fieldset
      className={styles.fieldset}
      aria-describedby={props.hint ? hintId : undefined}
    >
      <legend className={styles.legend}>{props.legend}</legend>
      {props.hint && (
        <p id={hintId} className={styles.muted}>
          {props.hint}
        </p>
      )}
      {props.people.length === 0 && (
        <p className={styles.muted}>{props.emptyText}</p>
      )}
      <div className={styles.choices}>
        {props.people.map((p) => (
          <Checkbox
            key={p.id}
            checked={props.selected.includes(p.id)}
            onChange={() => props.onToggle(p.id)}
            label={
              <span className={styles.person}>
                <Avatar name={p.name} image={p.image ?? undefined} size={20} />
                {p.name}
              </span>
            }
          />
        ))}
      </div>
      {props.error && (
        <p role="alert" className={styles.error}>
          {props.error}
        </p>
      )}
    </fieldset>
  )
}
