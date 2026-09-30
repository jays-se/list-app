import { useAction } from "@app/bridge"
import type { TaskDetailVM } from "@app/protocol"
import {
  Avatar,
  Button,
  Checkbox,
  DismissIcon,
  Dropdown,
  Field,
  IconButton,
  Input,
} from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import styles from "./sections.module.css"

export function ChecklistSection({ vm }: { vm: TaskDetailVM }) {
  const add = useAction("checklist.add")
  const update = useAction("checklist.update")
  const remove = useAction("checklist.delete")
  // Separate handles so an add error and a toggle error don't mix.
  const proposeAdd = useAction("requests.propose")
  const propose = useAction("requests.propose")
  const [title, setTitle] = useState("")
  const [assigneeId, setAssigneeId] = useState("")
  const canEdit = vm.mode === "manage"
  const requesting = vm.mode === "request"
  const addError = requesting ? proposeAdd.error : add.error

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      if (requesting) {
        await proposeAdd.run({
          taskId: vm.id,
          kind: "CHECKLIST_ADD",
          payload: { title },
        })
      } else {
        await add.run({ taskId: vm.id, title, assigneeId })
      }
      setTitle("")
      setAssigneeId("")
    } catch {
      // shown below
    }
  }
  const error = update.error ?? remove.error ?? propose.error

  return (
    <section className={styles.section} aria-labelledby="checklist-title">
      <h3 id="checklist-title" className={styles.heading}>
        Checklist <span className={styles.count}>{vm.checklistText}</span>
      </h3>
      {vm.checklist.length > 0 && (
        <ul className={styles.list}>
          {vm.checklist.map((c) => (
            <li key={c.id} className={styles.row}>
              {requesting ? (
                // Controlled: a toggle only files a request, so the box
                // keeps showing the saved state.
                <Checkbox
                  className={styles.grow}
                  checked={c.done}
                  disabled={c.pendingText !== null}
                  label={
                    <span>
                      <span className={c.done ? styles.done : undefined}>
                        {c.title}
                      </span>
                      {c.pendingText && (
                        <span className={styles.pending}>
                          {" "}
                          · {c.pendingText}
                        </span>
                      )}
                    </span>
                  }
                  onChange={(e) =>
                    propose
                      .run({
                        taskId: vm.id,
                        kind: "CHECKLIST_UPDATE",
                        payload: { itemId: c.id, done: e.target.checked },
                      })
                      .catch(() => {})
                  }
                />
              ) : (
                // Uncontrolled + keyed on the worker's value: the click shows
                // instantly; a rollback remounts it with the saved state.
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
              )}
              {canEdit ? (
                <span className={styles.picker}>
                  <Dropdown
                    size="small"
                    appearance="subtle"
                    aria-label={`Assignee for ${c.title}`}
                    value={c.assigneeId}
                    options={[
                      { value: "", label: "Unassigned" },
                      ...vm.options.members.map((m) => ({
                        value: m.id,
                        label: m.name,
                        media: (
                          <Avatar
                            name={m.name}
                            image={m.image ?? undefined}
                            size={20}
                          />
                        ),
                      })),
                    ]}
                    onChange={(assigneeId) =>
                      update
                        .run({ taskId: vm.id, itemId: c.id, assigneeId })
                        .catch(() => {})
                    }
                  />
                </span>
              ) : (
                c.assigneeName && (
                  <span className={styles.muted}>{c.assigneeName}</span>
                )
              )}
              {(canEdit || (requesting && !c.pendingText)) && (
                <IconButton
                  size="small"
                  appearance="subtle"
                  icon={<DismissIcon size={16} />}
                  aria-label={
                    requesting
                      ? `Request removal of ${c.title}`
                      : `Remove ${c.title}`
                  }
                  onClick={() =>
                    (requesting
                      ? propose.run({
                          taskId: vm.id,
                          kind: "CHECKLIST_REMOVE",
                          payload: { itemId: c.id },
                        })
                      : remove.run({ taskId: vm.id, itemId: c.id })
                    ).catch(() => {})
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
      {(canEdit || requesting) && (
        <form className={styles.inline} onSubmit={submit} noValidate>
          <Field
            label="New checklist item"
            validationMessage={addError?.message}
          >
            <Input
              value={title}
              maxLength={200}
              onChange={(e) => {
                setTitle(e.target.value)
                add.reset()
                proposeAdd.reset()
              }}
            />
          </Field>
          <Button type="submit" disabled={add.pending || proposeAdd.pending}>
            {requesting ? "Request item" : "Add item"}
          </Button>
        </form>
      )}
    </section>
  )
}
