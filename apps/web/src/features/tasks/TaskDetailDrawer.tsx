import { type ActionState, useAction, useView } from "@app/bridge"
import type { TaskDetailVM, TaskDraft } from "@app/protocol"
import { Button, ConfirmDialog, Drawer, Spinner } from "@app/ui-kit"
import { useState } from "react"
import { sameDraft } from "./draft.ts"
import styles from "./TaskDetailDrawer.module.css"
import { TaskForm } from "./TaskForm.tsx"
import { TaskReadOnly } from "./TaskReadOnly.tsx"

type Confirm = "discard" | "delete" | null

/** `?task=<id>`: view or edit one task (E4-S4). */
export function TaskDetailDrawer({
  taskId,
  onClose,
}: {
  taskId: string
  onClose: () => void
}) {
  const detail = useView("tasks.detail", { taskId })
  const save = useAction("tasks.save")
  const remove = useAction("tasks.delete")
  const refresh = useAction("tasks.refresh")
  // null = showing saved values (they keep updating via polling).
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const vm = detail.data
  const dirty = Boolean(draft && vm && !sameDraft(draft, vm.saved))
  const conflict = save.error?.code === "HTTP_409"

  const requestClose = () => (dirty ? setConfirm("discard") : onClose())

  async function submit() {
    if (!vm || !draft) return
    try {
      await save.run({ taskId, draft })
      setDraft(null)
    } catch {
      // save.error drives the messages
    }
  }

  function reloadLatest() {
    setDraft(null)
    save.reset()
    void refresh.run({ taskId }).catch(() => {})
  }

  async function confirmDelete() {
    try {
      await remove.run({ taskId })
      onClose()
    } catch {
      setConfirm(null)
    }
  }

  const missing = !vm && detail.error?.code === "HTTP_404"
  return (
    <>
      <Drawer
        open
        size="large"
        title={vm?.title ?? (missing ? "Task not found" : "Task")}
        subtitle={vm && <Subtitle vm={vm} />}
        onRequestClose={requestClose}
        footer={
          vm?.mode === "manage" && (
            <ManageFooter
              {...{ vm, dirty, save, submit, setDraft, setConfirm }}
            />
          )
        }
      >
        {!vm && !detail.error && <Spinner label="Loading task" />}
        {!vm && detail.error && (
          <p role="alert" className={styles.alert}>
            {detail.error.message}
          </p>
        )}
        {vm && conflict && (
          <div role="alert" className={styles.conflict}>
            <span>{save.error?.message}</span>
            <Button size="small" onClick={reloadLatest}>
              Reload latest
            </Button>
          </div>
        )}
        {vm && remove.error && (
          <p role="alert" className={styles.alert}>
            {remove.error.message}
          </p>
        )}
        {vm?.mode === "manage" && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              void submit()
            }}
            noValidate
          >
            <TaskForm
              draft={draft ?? vm.saved}
              options={vm.options}
              error={conflict ? undefined : save.error}
              ownerCandidates={
                vm.canManageOwners ? vm.ownerCandidates : undefined
              }
              onChange={(next) => {
                setDraft(next)
                if (!conflict) save.reset()
              }}
            />
          </form>
        )}
        {vm?.mode === "view" && <TaskReadOnly vm={vm} />}
        {vm && (
          <p className={styles.meta}>
            {vm.createdText} · {vm.updatedText}
          </p>
        )}
      </Drawer>
      <ConfirmDialog
        open={confirm === "discard"}
        title="Discard your unsaved changes to this task?"
        confirmLabel="Discard"
        cancelLabel="Keep editing"
        onConfirm={onClose}
        onCancel={() => setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this task?"
        confirmLabel="Delete"
        pending={remove.pending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirm(null)}
      >
        This can't be undone.
      </ConfirmDialog>
    </>
  )
}

function Subtitle({ vm }: { vm: TaskDetailVM }) {
  return (
    <span>
      {vm.statusLabel} · {vm.priorityLabel}
      {vm.dueText ? ` · ${vm.dueText}` : ""}
      {vm.mode === "view" ? " · View only" : ""}
    </span>
  )
}

function ManageFooter(props: {
  vm: TaskDetailVM
  dirty: boolean
  save: ActionState<"tasks.save">
  submit: () => Promise<void>
  setDraft: (d: TaskDraft | null) => void
  setConfirm: (c: Confirm) => void
}) {
  const { dirty, save, submit, setDraft, setConfirm } = props
  return (
    <>
      <Button
        appearance="primary"
        onClick={submit}
        disabled={!dirty || save.pending}
      >
        {save.pending ? "Saving…" : "Save changes"}
      </Button>
      <Button
        onClick={() => {
          setDraft(null)
          save.reset()
        }}
        disabled={!dirty}
      >
        Revert
      </Button>
      <span className={styles.spacer} />
      <Button appearance="subtle" onClick={() => setConfirm("delete")}>
        Delete task
      </Button>
    </>
  )
}
