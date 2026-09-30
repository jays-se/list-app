import { useAction, useView } from "@app/bridge"
import type { TaskDraft } from "@app/protocol"
import { Button, ConfirmDialog, Drawer, Spinner } from "@app/ui-kit"
import { useState } from "react"
import { sameDraft } from "./draft.ts"
import { TaskForm } from "./TaskForm.tsx"

export function CreateTaskDrawer({
  onClose,
}: {
  onClose: (createdId?: string) => void
}) {
  const options = useView("tasks.formOptions", {})
  const create = useAction("tasks.create")
  const [draft, setDraft] = useState<TaskDraft | null>(null) // uncommitted UI state
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const vm = options.data
  const current = draft ?? vm?.defaults
  const dirty = Boolean(draft && vm && !sameDraft(draft, vm.defaults))

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose())

  async function submit() {
    if (!current) return
    try {
      const { id } = await create.run(current)
      onClose(id)
    } catch {
      // create.error drives the form messages
    }
  }

  return (
    <>
      <Drawer
        open
        title="New task"
        onRequestClose={requestClose}
        footer={
          <>
            <Button
              appearance="primary"
              onClick={submit}
              disabled={!current || create.pending}
            >
              {create.pending ? "Creating…" : "Create task"}
            </Button>
            <Button onClick={requestClose}>Cancel</Button>
          </>
        }
      >
        {!vm || !current ? (
          <Spinner label="Loading" />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            noValidate
          >
            <TaskForm
              draft={current}
              options={vm}
              error={create.error}
              autoFocusTitle
              onChange={(next) => {
                setDraft(next)
                create.reset()
              }}
            />
          </form>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard this new task?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={() => onClose()}
        onCancel={() => setConfirmDiscard(false)}
      />
    </>
  )
}
