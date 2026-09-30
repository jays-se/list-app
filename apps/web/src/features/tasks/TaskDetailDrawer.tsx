import { type ActionState, useAction, useView } from "@app/bridge"
import type { RequestDraft, TaskDetailVM, TaskDraft } from "@app/protocol"
import {
  Button,
  ConfirmDialog,
  Drawer,
  Field,
  Spinner,
  Tabs,
  Textarea,
} from "@app/ui-kit"
import { useState } from "react"
import { Link, useSearchParams } from "react-router"
import { sameDraft } from "./draft.ts"
import { RequestForm } from "./RequestForm.tsx"
import { ActivityTab } from "./sections/ActivityTab.tsx"
import { AttachmentsSection } from "./sections/AttachmentsSection.tsx"
import { ChecklistSection } from "./sections/ChecklistSection.tsx"
import { CommentsSection } from "./sections/CommentsSection.tsx"
import { RequestsSection } from "./sections/RequestsSection.tsx"
import { SubtasksSection } from "./sections/SubtasksSection.tsx"
import styles from "./TaskDetailDrawer.module.css"
import { TaskForm } from "./TaskForm.tsx"
import { TaskReadOnly } from "./TaskReadOnly.tsx"

type Confirm = "discard" | "delete" | "request" | null

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
  const submitRequest = useAction("requests.submit")
  // Request mode: uncommitted proposal + its note (UI state, ADR-0005).
  const [requestDraft, setRequestDraft] = useState<RequestDraft | null>(null)
  const [note, setNote] = useState("")
  // null = showing saved values (they keep updating via polling).
  const [draft, setDraft] = useState<TaskDraft | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const [tab, setTab] = useState<"details" | "activity">("details") // UI state
  const [search] = useSearchParams()
  const taskLink = (id: string) => {
    const next = new URLSearchParams(search)
    next.set("task", id)
    return { search: `?${next}` }
  }
  const vm = detail.data
  const dirty =
    Boolean(draft && vm && !sameDraft(draft, vm.saved)) ||
    Boolean(
      requestDraft &&
        vm &&
        JSON.stringify(requestDraft) !== JSON.stringify(vm.requestDraft)
    )
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

  async function sendRequest() {
    if (!requestDraft) return
    try {
      await submitRequest.run({ taskId, draft: requestDraft, note })
      setRequestDraft(null)
      setNote("")
      setConfirm(null)
    } catch (error) {
      // Field problems belong on the form; others stay in the dialog.
      const e = error as { fieldErrors?: { field: string }[] }
      if (e.fieldErrors?.some((f) => f.field !== "note")) setConfirm(null)
    }
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
          (vm?.mode === "manage" && (
            <ManageFooter
              {...{ vm, dirty, save, submit, setDraft, setConfirm }}
            />
          )) ||
          (vm?.mode === "request" && (
            <>
              <Button
                appearance="primary"
                disabled={!dirty || submitRequest.pending}
                onClick={() => {
                  submitRequest.reset()
                  setConfirm("request")
                }}
              >
                Request changes
              </Button>
              <Button
                disabled={!dirty}
                onClick={() => {
                  setRequestDraft(null)
                  submitRequest.reset()
                }}
              >
                Revert
              </Button>
            </>
          ))
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
        {vm && (
          <Tabs
            label="Task sections"
            value={tab}
            onChange={setTab}
            items={[
              { value: "details", label: "Details" },
              { value: "activity", label: "Activity" },
            ]}
          >
            {tab === "details" ? (
              <div className={styles.details}>
                {vm.parent && (
                  <p className={styles.parent}>
                    Subtask of{" "}
                    <Link to={taskLink(vm.parent.id)}>{vm.parent.title}</Link>
                  </p>
                )}
                {vm.mode === "manage" && (
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
                {vm.mode === "request" && (
                  <RequestForm
                    vm={vm}
                    draft={requestDraft ?? vm.requestDraft}
                    error={
                      confirm === "request" ? undefined : submitRequest.error
                    }
                    onChange={(next) => {
                      setRequestDraft(next)
                      submitRequest.reset()
                    }}
                  />
                )}
                {vm.mode !== "manage" && <TaskReadOnly vm={vm} />}
                <RequestsSection vm={vm} />
                <SubtasksSection vm={vm} />
                <ChecklistSection vm={vm} />
                <AttachmentsSection vm={vm} />
                <CommentsSection vm={vm} />
                <p className={styles.meta}>
                  {vm.createdText} · {vm.updatedText}
                </p>
              </div>
            ) : (
              <ActivityTab taskId={taskId} />
            )}
          </Tabs>
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
        open={confirm === "request"}
        title="Send your changes for approval?"
        confirmLabel={submitRequest.pending ? "Sending…" : "Send request"}
        pending={submitRequest.pending}
        onConfirm={sendRequest}
        onCancel={() => setConfirm(null)}
      >
        <p className={styles.meta}>
          Each changed field becomes its own request to the task's creator and
          owners.
        </p>
        <Field
          label="Note"
          hint="Optional · up to 1,000 characters"
          validationMessage={submitRequest.error?.message}
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
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
      {vm.mode === "request" ? " · Changes need approval" : ""}
      {vm.pendingRequestCount > 0 ? ` · ${vm.requestsText}` : ""}
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
