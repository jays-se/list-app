import { useAction, useView } from "@app/bridge"
import type { TaskDraft } from "@app/protocol"
import { Button, Checkbox, ConfirmDialog, Drawer, Spinner } from "@app/ui-kit"
import { useState } from "react"
import styles from "./CreateTaskDrawer.module.css"
import { sameDraft } from "./draft.ts"
import { TaskForm } from "./TaskForm.tsx"

const isMac =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform)

/**
 * "New task", opened from anywhere with `?create=1`. Ctrl/⌘+Enter creates;
 * "Create another" keeps the drawer open with a fresh form.
 */
export function CreateTaskDrawer({
  onClose,
}: {
  onClose: (createdId?: string) => void
}) {
  const options = useView("tasks.formOptions", {})
  const create = useAction("tasks.create")
  // Uncommitted UI state: the draft, the "another" toggle, the last title.
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [another, setAnother] = useState(false)
  const [created, setCreated] = useState<string | null>(null)
  const [formKey, setFormKey] = useState(0)
  const [confirmDiscard, setConfirmDiscard] = useState(false)
  const vm = options.data
  const current = draft ?? vm?.defaults
  const dirty = Boolean(draft && vm && !sameDraft(draft, vm.defaults))

  const requestClose = () => (dirty ? setConfirmDiscard(true) : onClose())

  async function submit() {
    if (!current || create.pending) return
    try {
      const { id } = await create.run(current)
      if (!another) return onClose(id)
      setCreated(current.title.trim())
      setDraft(null)
      setFormKey((k) => k + 1) // remount → title autofocus again
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
          <div className={styles.footer}>
            <Button
              appearance="primary"
              onClick={submit}
              disabled={!current || create.pending}
            >
              {create.pending ? "Creating…" : "Create task"}
            </Button>
            <Button onClick={requestClose}>Cancel</Button>
            <Checkbox
              label="Create another"
              checked={another}
              onChange={(e) => setAnother(e.target.checked)}
            />
            <span className={styles.hint} aria-hidden="true">
              {isMac ? "⌘" : "Ctrl"} + Enter to create
            </span>
          </div>
        }
      >
        {!vm || !current ? (
          <Spinner label="Loading" />
        ) : (
          <form
            key={formKey}
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault()
                void submit()
              }
            }}
            noValidate
          >
            {created && (
              <p role="status" className={styles.created}>
                Created “{created}”. Add the next one.
              </p>
            )}
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
