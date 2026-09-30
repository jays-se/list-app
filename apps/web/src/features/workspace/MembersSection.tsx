import { useAction, useView } from "@app/bridge"
import type { MemberVM } from "@app/protocol"
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Dropdown,
  Spinner,
} from "@app/ui-kit"
import { useState } from "react"
import styles from "./WorkspaceSettingsPage.module.css"

/** Members with owner controls, and leaving (E3-S5, E3-S6). */
export function MembersSection({ workspaceName }: { workspaceName: string }) {
  const members = useView("workspace.members", {})
  const setRole = useAction("members.setRole")
  const remove = useAction("members.remove")
  const leave = useAction("workspaces.leave")
  const rotate = useAction("workspaces.rotateInvite")
  const [removing, setRemoving] = useState<MemberVM | null>(null)
  const [removed, setRemoved] = useState<string | null>(null)
  const [leaving, setLeaving] = useState(false)
  const vm = members.data

  async function confirmRemove() {
    if (!removing) return
    try {
      await remove.run({ userId: removing.id })
      setRemoved(removing.name)
      setRemoving(null)
    } catch {
      setRemoving(null)
    }
  }

  async function confirmLeave() {
    try {
      // The worker resets; the session guard takes us to the next workspace.
      await leave.run({})
    } catch {
      setLeaving(false)
    }
  }

  const error = setRole.error ?? remove.error
  return (
    <>
      <section className={styles.card} aria-labelledby="members-title">
        <h2 id="members-title" className={styles.cardTitle}>
          Members {vm && <span className={styles.count}>{vm.countText}</span>}
        </h2>
        {members.status === "loading" && <Spinner label="Loading members" />}
        {members.error && !vm && (
          <p role="alert" className={styles.error}>
            {members.error.message}
          </p>
        )}
        {removed && (
          <div role="status" className={styles.notice}>
            <span>
              Removed {removed}. They can rejoin with the current invite code.
            </span>
            <Button
              size="small"
              disabled={rotate.pending}
              onClick={() =>
                rotate
                  .run({})
                  .then(() => setRemoved(null))
                  .catch(() => {})
              }
            >
              Generate new code
            </Button>
          </div>
        )}
        {error && (
          <p role="alert" className={styles.error}>
            {error.message}
          </p>
        )}
        {vm && (
          <ul className={styles.members}>
            {vm.members.map((m) => (
              <li key={m.id} className={styles.member}>
                <Avatar name={m.name} image={m.image ?? undefined} size={32} />
                <span className={styles.who}>
                  <span className={styles.name}>
                    {m.name}
                    {m.isYou && <span className={styles.you}> (you)</span>}
                  </span>
                  <span className={styles.meta}>
                    {m.email} · {m.joinedText}
                  </span>
                </span>
                {m.canChangeRole ? (
                  <Dropdown
                    size="small"
                    aria-label={`Role for ${m.name}`}
                    className={styles.role}
                    value={m.role}
                    disabled={setRole.pending}
                    options={vm.roleOptions}
                    onChange={(role: MemberVM["role"]) =>
                      setRole.run({ userId: m.id, role }).catch(() => {})
                    }
                  />
                ) : (
                  <Badge color={m.isOwner ? "brand" : "subtle"}>
                    {m.roleLabel}
                  </Badge>
                )}
                {m.canRemove && (
                  <Button
                    size="small"
                    appearance="subtle"
                    aria-label={`Remove ${m.name}`}
                    onClick={() => {
                      remove.reset()
                      setRemoving(m)
                    }}
                  >
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.card} aria-labelledby="leave-title">
        <h2 id="leave-title" className={styles.cardTitle}>
          Leave workspace
        </h2>
        <p className={styles.text}>
          You'll lose access to {workspaceName}. Your tasks and comments stay.
        </p>
        {leave.error && (
          <p role="alert" className={styles.error}>
            {leave.error.message}
          </p>
        )}
        <div>
          <Button
            onClick={() => {
              leave.reset()
              setLeaving(true)
            }}
          >
            Leave {workspaceName}
          </Button>
        </div>
      </section>

      <ConfirmDialog
        open={removing !== null}
        title={`Remove ${removing?.name ?? ""} from ${workspaceName}?`}
        confirmLabel="Remove"
        pending={remove.pending}
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      >
        Their assignments, ownerships and pending requests are removed. Comments
        and history they wrote stay.
      </ConfirmDialog>
      <ConfirmDialog
        open={leaving}
        title={`Leave ${workspaceName}?`}
        confirmLabel="Leave"
        pending={leave.pending}
        onConfirm={confirmLeave}
        onCancel={() => setLeaving(false)}
      >
        You're unassigned from its tasks. Rejoining needs an invite code.
      </ConfirmDialog>
    </>
  )
}
