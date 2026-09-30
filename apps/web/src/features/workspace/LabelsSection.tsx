import { useAction, useView } from "@app/bridge"
import type { LabelColorKey } from "@app/protocol"
import {
  Button,
  DismissIcon,
  Field,
  IconButton,
  Input,
  LabelChip,
  Select,
  Spinner,
} from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import styles from "./LabelsSection.module.css"

/** Workspace labels (E8-S2): any member adds; owners delete. */
export function LabelsSection() {
  const labels = useView("labels.list", {})
  const create = useAction("labels.create")
  const remove = useAction("labels.delete")
  const [name, setName] = useState("")
  const [color, setColor] = useState<LabelColorKey>("blue")
  const vm = labels.data

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await create.run({ name, color })
      setName("")
    } catch {
      // create.error drives the message
    }
  }

  const nameError = create.error?.fieldErrors?.find(
    (f) => f.field === "name"
  )?.message
  const formError =
    create.error && !create.error.fieldErrors?.length
      ? create.error.message
      : undefined

  return (
    <section className={styles.card} aria-labelledby="labels-title">
      <h2 id="labels-title" className={styles.title}>
        Labels
      </h2>
      {!vm && <Spinner label="Loading labels" />}
      {vm && vm.labels.length === 0 && (
        <p className={styles.muted}>No labels yet.</p>
      )}
      {vm && vm.labels.length > 0 && (
        <ul className={styles.list}>
          {vm.labels.map((l) => (
            <li key={l.id} className={styles.item}>
              <LabelChip color={l.color}>{l.name}</LabelChip>
              {l.canDelete && (
                <IconButton
                  size="small"
                  appearance="subtle"
                  icon={<DismissIcon size={16} />}
                  aria-label={`Delete label ${l.name}`}
                  disabled={remove.pending}
                  onClick={() => remove.run({ labelId: l.id }).catch(() => {})}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.error && (
        <p role="alert" className={styles.error}>
          {remove.error.message}
        </p>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field label="New label" validationMessage={nameError ?? formError}>
          <Input
            value={name}
            maxLength={40}
            onChange={(e) => {
              setName(e.target.value)
              create.reset()
            }}
          />
        </Field>
        <Field label="Color">
          <Select
            value={color}
            onChange={(e) => setColor(e.target.value as LabelColorKey)}
          >
            {(vm?.colorOptions ?? []).map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
        <Button type="submit" disabled={create.pending}>
          {create.pending ? "Adding…" : "Add label"}
        </Button>
      </form>
      {vm && !vm.canDelete && (
        <p className={styles.muted}>Only workspace owners can delete labels.</p>
      )}
    </section>
  )
}
