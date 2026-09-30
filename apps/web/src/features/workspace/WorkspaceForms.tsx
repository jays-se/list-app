import { useAction } from "@app/bridge"
import type { ProtocolError, WorkspaceRefVM } from "@app/protocol"
import { Button, Field, Input } from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import styles from "./WorkspaceForms.module.css"

function fieldMessage(error: ProtocolError | undefined, field: string) {
  return error?.fieldErrors?.find((f) => f.field === field)?.message
}

/** A form-level message only when no field claimed the error. */
function formMessage(error: ProtocolError | undefined) {
  return error && !error.fieldErrors?.length ? error.message : undefined
}

interface FormProps {
  onDone?: (workspace: WorkspaceRefVM) => void
}

export function CreateWorkspaceForm({ onDone }: FormProps) {
  const create = useAction("workspaces.create")
  const [name, setName] = useState("") // uncommitted draft: UI state

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const ws = await create.run({ name })
      setName("")
      onDone?.(ws)
    } catch {
      // create.error drives the messages below
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Field
        label="Workspace name"
        hint="You'll be its owner. You can invite people next."
        validationMessage={fieldMessage(create.error, "name")}
        required
      >
        <Input
          value={name}
          maxLength={100}
          onChange={(e) => {
            setName(e.target.value)
            create.reset()
          }}
          placeholder="e.g. Platform team"
        />
      </Field>
      {formMessage(create.error) && (
        <p role="alert" className={styles.error}>
          {formMessage(create.error)}
        </p>
      )}
      <Button type="submit" appearance="primary" disabled={create.pending}>
        {create.pending ? "Creating…" : "Create workspace"}
      </Button>
    </form>
  )
}

export function JoinWorkspaceForm({ onDone }: FormProps) {
  const join = useAction("workspaces.join")
  const [code, setCode] = useState("")

  async function submit(event: FormEvent) {
    event.preventDefault()
    try {
      const ws = await join.run({ inviteCode: code })
      setCode("")
      onDone?.(ws)
    } catch {
      // join.error drives the messages below
    }
  }

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <Field
        label="Invite code"
        hint="Ask a workspace owner for their code."
        validationMessage={
          fieldMessage(join.error, "inviteCode") ??
          (join.error?.code === "HTTP_404" ? join.error.message : undefined)
        }
        required
      >
        <Input
          value={code}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setCode(e.target.value)
            join.reset()
          }}
        />
      </Field>
      {join.error?.code !== "HTTP_404" && formMessage(join.error) && (
        <p role="alert" className={styles.error}>
          {formMessage(join.error)}
        </p>
      )}
      <Button type="submit" disabled={join.pending}>
        {join.pending ? "Joining…" : "Join workspace"}
      </Button>
    </form>
  )
}
