import { useAction } from "@app/bridge"
import type { TaskDetailVM } from "@app/protocol"
import { Badge, Button, Field, Input } from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import { Link, useSearchParams } from "react-router"
import styles from "./sections.module.css"

export function SubtasksSection({ vm }: { vm: TaskDetailVM }) {
  const add = useAction("tasks.addSubtask")
  const [title, setTitle] = useState("")
  const [search] = useSearchParams()
  const linkTo = (id: string) => {
    const next = new URLSearchParams(search)
    next.set("task", id)
    return { search: `?${next}` }
  }
  if (vm.parent) return null
  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await add.run({ parentId: vm.id, title })
      setTitle("")
    } catch {
      // add.error shown below
    }
  }
  return (
    <section className={styles.section} aria-labelledby="subtasks-title">
      <h3 id="subtasks-title" className={styles.heading}>
        Subtasks <span className={styles.count}>{vm.subtasksText}</span>
      </h3>
      {vm.subtasks.length > 0 && (
        <ul className={styles.list}>
          {vm.subtasks.map((s) => (
            <li key={s.id} className={styles.row}>
              <Link to={linkTo(s.id)} className={styles.grow}>
                <span className={s.isDone ? styles.done : undefined}>
                  {s.title}
                </span>
              </Link>
              <Badge color={s.isDone ? "success" : "subtle"}>
                {s.statusLabel}
              </Badge>
            </li>
          ))}
        </ul>
      )}
      {vm.canAddSubtask && (
        <form className={styles.inline} onSubmit={submit} noValidate>
          <Field
            label="New subtask"
            validationMessage={
              add.error?.fieldErrors?.[0]?.message ??
              (add.error?.fieldErrors?.length ? undefined : add.error?.message)
            }
          >
            <Input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value)
                add.reset()
              }}
            />
          </Field>
          <Button type="submit" disabled={add.pending}>
            Add subtask
          </Button>
        </form>
      )}
    </section>
  )
}
