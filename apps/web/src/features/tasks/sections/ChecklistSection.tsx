import { useAction } from "@app/bridge"
import type { TaskDetailVM } from "@app/protocol"
import {
  Button,
  Checkbox,
  DismissIcon,
  Field,
  IconButton,
  Input,
  Select,
} from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import styles from "./sections.module.css"

export function ChecklistSection({ vm }: { vm: TaskDetailVM }) {
  const add = useAction("checklist.add")
  const update = useAction("checklist.update")
  const remove = useAction("checklist.delete")
  const [title, setTitle] = useState("")
  const [assigneeId, setAssigneeId] = useState("")
  const canEdit = vm.mode === "manage"

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await add.run({ taskId: vm.id, title, assigneeId })
      setTitle("")
      setAssigneeId("")
    } catch {
      // add.error shown below
    }
  }
  const error = update.error ?? remove.error

  return (
    <section className={styles.section} aria-labelledby="checklist-title">
      <h3 id="checklist-title" className={styles.heading}>
        Checklist <span className={styles.count}>{vm.checklistText}</span>
      </h3>
      {vm.checklist.length > 0 && (
        <ul className={styles.list}>
          {vm.checklist.map((c) => (
            <li key={c.id} className={styles.row}>
              {/* Uncontrolled + keyed on the worker's value: the click shows
                  instantly; a rollback remounts it with the saved state. */}
              <Checkbox
                key={`${c.id}:${c.done}`}
                className={styles.grow}
                defaultChecked={c.done}
                disabled={!canEdit}
                label={
                  <span className={c.done ? styles.done : undefined}>
                    {c.title}
                  </span>
                }
                onChange={(e) =>
                  update
                    .run({
                      taskId: vm.id,
                      itemId: c.id,
                      done: e.target.checked,
                    })
                    .catch(() => {})
                }
              />
              {canEdit ? (
                <span className={styles.picker}>
                  <Select
                    size="small"
                    aria-label={`Assignee for ${c.title}`}
                    value={c.assigneeId}
                    onChange={(e) =>
                      update
                        .run({
                          taskId: vm.id,
                          itemId: c.id,
                          assigneeId: e.target.value,
                        })
                        .catch(() => {})
                    }
                  >
                    <option value="">Unassigned</option>
                    {vm.options.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </Select>
                </span>
              ) : (
                c.assigneeName && (
                  <span className={styles.muted}>{c.assigneeName}</span>
                )
              )}
              {canEdit && (
                <IconButton
                  size="small"
                  appearance="subtle"
                  icon={<DismissIcon size={16} />}
                  aria-label={`Remove ${c.title}`}
                  onClick={() =>
                    remove.run({ taskId: vm.id, itemId: c.id }).catch(() => {})
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
      {canEdit && (
        <form className={styles.inline} onSubmit={submit} noValidate>
          <Field
            label="New checklist item"
            validationMessage={add.error?.message}
          >
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value)
                add.reset()
              }}
            />
          </Field>
          <Button type="submit" disabled={add.pending}>
            Add item
          </Button>
        </form>
      )}
    </section>
  )
}
