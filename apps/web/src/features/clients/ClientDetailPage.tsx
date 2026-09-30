import { useAction, useView } from "@app/bridge"
import type { ClientDraft } from "@app/protocol"
import { Badge, Button, ConfirmDialog, LabelChip, Spinner } from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ClientForm } from "./ClientForm.tsx"
import styles from "./Clients.module.css"

/** /clients/:clientId — edit, linked tasks, delete (unlinks tasks). */
export function ClientDetailPage() {
  const { clientId = "" } = useParams()
  const detail = useView("clients.detail", { clientId })
  const update = useAction("clients.update")
  const remove = useAction("clients.delete")
  const [draft, setDraft] = useState<ClientDraft | null>(null) // null = saved values
  const [confirm, setConfirm] = useState(false)
  const navigate = useNavigate()
  const vm = detail.data

  if (!vm) {
    return detail.error ? (
      <div className={styles.page}>
        <p role="alert" className={styles.error}>
          {detail.error.message}
        </p>
        <Link to="/clients">Back to clients</Link>
      </div>
    ) : (
      <Spinner label="Loading client" />
    )
  }

  const dirty =
    draft !== null && JSON.stringify(draft) !== JSON.stringify(vm.saved)
  async function submit(e: FormEvent) {
    e.preventDefault()
    if (!draft) return
    try {
      await update.run({ clientId, draft })
      setDraft(null)
    } catch {
      // update.error shown in the form
    }
  }

  return (
    <div className={styles.page}>
      <Link to="/clients">← Clients</Link>
      <h1 className={styles.title}>
        <LabelChip color={vm.client.color}>{vm.client.name}</LabelChip>
      </h1>
      <section className={styles.panel} aria-labelledby="client-details">
        <h2 id="client-details" className={styles.subtitle}>
          Details
        </h2>
        <form onSubmit={submit} noValidate className={styles.form}>
          <ClientForm
            draft={draft ?? vm.saved}
            colorOptions={vm.colorOptions}
            error={update.error}
            onChange={(d) => {
              setDraft(d)
              update.reset()
            }}
          />
          <div className={styles.actions}>
            <Button
              type="submit"
              appearance="primary"
              disabled={!dirty || update.pending}
            >
              Save changes
            </Button>
            {vm.canDelete && (
              <Button appearance="subtle" onClick={() => setConfirm(true)}>
                Delete client
              </Button>
            )}
          </div>
        </form>
      </section>
      <section className={styles.panel} aria-labelledby="client-tasks">
        <h2 id="client-tasks" className={styles.subtitle}>
          Tasks <span className={styles.muted}>{vm.tasksText}</span>
        </h2>
        {vm.tasks.length === 0 ? (
          <p className={styles.muted}>
            No tasks linked yet. Pick this client on a task.
          </p>
        ) : (
          <ul className={styles.taskList}>
            {vm.tasks.map((t) => (
              <li key={t.id} className={styles.taskRow}>
                <Link to={`/tasks?task=${t.id}`}>{t.title}</Link>
                <Badge color="subtle">{t.statusLabel}</Badge>
                {t.dueText && (
                  <Badge color={t.dueTone} appearance="outline">
                    {t.dueText}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className={styles.panel} aria-labelledby="client-docs">
        <h2 id="client-docs" className={styles.subtitle}>
          Docs <span className={styles.muted}>{vm.docsText}</span>
        </h2>
        {vm.docs.length === 0 ? (
          <p className={styles.muted}>
            No docs linked yet. Pick this client on a doc.
          </p>
        ) : (
          <ul className={styles.taskList}>
            {vm.docs.map((d) => (
              <li key={d.id} className={styles.taskRow}>
                <Link to={`/docs/${d.id}`}>{d.title}</Link>
                <span className={styles.muted}>{d.metaText}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
      {remove.error && (
        <p role="alert" className={styles.error}>
          {remove.error.message}
        </p>
      )}
      <ConfirmDialog
        open={confirm}
        title={`Delete ${vm.client.name}?`}
        confirmLabel="Delete"
        pending={remove.pending}
        onCancel={() => setConfirm(false)}
        onConfirm={async () => {
          try {
            await remove.run({ clientId })
            navigate("/clients")
          } catch {
            setConfirm(false)
          }
        }}
      >
        Tasks and docs will be unlinked, not deleted.
      </ConfirmDialog>
    </div>
  )
}
