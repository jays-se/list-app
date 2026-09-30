import { useAction, useView } from "@app/bridge"
import type { ClientDraft } from "@app/protocol"
import { Button, LabelChip, Spinner } from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import { Link, useNavigate } from "react-router"
import { ClientForm } from "./ClientForm.tsx"
import styles from "./Clients.module.css"

const EMPTY: ClientDraft = {
  name: "",
  email: "",
  phone: "",
  color: "blue",
  notes: "",
}

/** /clients (E8-S1). */
export function ClientsPage() {
  const clients = useView("clients.list", {})
  const create = useAction("clients.create")
  const [draft, setDraft] = useState<ClientDraft>(EMPTY)
  const navigate = useNavigate()
  const vm = clients.data

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      const { id } = await create.run(draft)
      setDraft(EMPTY)
      navigate(`/clients/${id}`)
    } catch {
      // create.error drives the messages
    }
  }

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Clients</h1>
      {!vm && <Spinner label="Loading clients" />}
      {vm && vm.clients.length === 0 && (
        <p className={styles.muted}>{vm.emptyText}</p>
      )}
      {vm && vm.clients.length > 0 && (
        <ul className={styles.cards}>
          {vm.clients.map((c) => (
            <li key={c.id}>
              <Link to={`/clients/${c.id}`} className={styles.card}>
                <LabelChip color={c.color}>{c.name}</LabelChip>
                <span className={styles.muted}>
                  {[c.email, c.phone].filter(Boolean).join(" · ") ||
                    "No contact details"}
                </span>
                <span className={styles.muted}>{c.taskCountText}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {vm && (
        <section className={styles.panel} aria-labelledby="new-client">
          <h2 id="new-client" className={styles.subtitle}>
            New client
          </h2>
          <form onSubmit={submit} noValidate className={styles.form}>
            <ClientForm
              draft={draft}
              colorOptions={vm.colorOptions}
              error={create.error}
              onChange={(d) => {
                setDraft(d)
                create.reset()
              }}
            />
            <Button
              type="submit"
              appearance="primary"
              disabled={create.pending}
            >
              {create.pending ? "Adding…" : "Add client"}
            </Button>
          </form>
        </section>
      )}
    </div>
  )
}
