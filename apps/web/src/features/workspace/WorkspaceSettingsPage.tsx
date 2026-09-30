import { useAction, useView } from "@app/bridge"
import { Button, Spinner } from "@app/ui-kit"
import { useState } from "react"
import { LabelsSection } from "./LabelsSection.tsx"
import { MembersSection } from "./MembersSection.tsx"
import { CreateWorkspaceForm, JoinWorkspaceForm } from "./WorkspaceForms.tsx"
import styles from "./WorkspaceSettingsPage.module.css"

/** Invite code, members, and adding another workspace (E3-S5). */
export function WorkspaceSettingsPage() {
  const session = useView("session.current", {})
  const rotate = useAction("workspaces.rotateInvite")
  const [copied, setCopied] = useState(false) // transient UI feedback
  const active = session.data?.activeWorkspace

  if (!active) return <Spinner label="Loading workspace" />

  async function copy(code: string) {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>{active.name}</h1>
        <p className={styles.lead}>
          Workspace settings · you are {active.roleLabel.toLowerCase()}
        </p>
      </header>

      <section className={styles.card} aria-labelledby="invite-title">
        <h2 id="invite-title" className={styles.cardTitle}>
          Invite people
        </h2>
        <p className={styles.text}>
          Share this code. Anyone who has it can join.
        </p>
        <div className={styles.inviteRow}>
          <code className={styles.code} data-testid="invite-code">
            {active.inviteCode}
          </code>
          <Button onClick={() => copy(active.inviteCode)}>
            {copied ? "Copied" : "Copy"}
          </Button>
          {active.isOwner && (
            <Button
              appearance="subtle"
              disabled={rotate.pending}
              onClick={() => rotate.run({}).catch(() => {})}
            >
              {rotate.pending ? "Generating…" : "Generate new code"}
            </Button>
          )}
        </div>
        {active.isOwner && (
          <p className={styles.hint}>
            Generating a new code stops the old one from working.
          </p>
        )}
        {rotate.error && (
          <p role="alert" className={styles.error}>
            {rotate.error.message}
          </p>
        )}
      </section>

      <MembersSection workspaceName={active.name} />

      <LabelsSection />

      <section className={styles.card} aria-labelledby="add-title">
        <h2 id="add-title" className={styles.cardTitle}>
          Add another workspace
        </h2>
        <div className={styles.forms}>
          <CreateWorkspaceForm />
          <JoinWorkspaceForm />
        </div>
      </section>
    </div>
  )
}
