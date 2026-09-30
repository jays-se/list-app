import { useAction } from "@app/bridge"
import type { ChangeRequestVM, TaskDetailVM } from "@app/protocol"
import {
  Avatar,
  Badge,
  Button,
  ConfirmDialog,
  Field,
  Textarea,
} from "@app/ui-kit"
import { useState } from "react"
import styles from "./sections.module.css"

/** Change requests on a task: managers review, requesters withdraw (E5-S3). */
export function RequestsSection({ vm }: { vm: TaskDetailVM }) {
  const approve = useAction("requests.approve")
  const reject = useAction("requests.reject")
  const withdraw = useAction("requests.withdraw")
  const [rejecting, setRejecting] = useState<ChangeRequestVM | null>(null)
  const [note, setNote] = useState("")
  if (vm.requests.length === 0 && vm.mode !== "request") return null
  const error = approve.error ?? withdraw.error
  const taskId = vm.id

  async function confirmReject() {
    if (!rejecting) return
    try {
      await reject.run({ taskId, requestId: rejecting.id, note })
      setRejecting(null)
      setNote("")
    } catch {
      // reject.error shown in the dialog
    }
  }

  return (
    <section className={styles.section} aria-labelledby="requests-title">
      <h3 id="requests-title" className={styles.heading}>
        Change requests <span className={styles.count}>{vm.requestsText}</span>
      </h3>
      {vm.requests.length > 0 && (
        <ul className={styles.list} aria-label="Change requests">
          {vm.requests.map((r) => (
            <li key={r.id} className={styles.request}>
              <Avatar
                name={r.requesterName}
                image={r.requesterImage ?? undefined}
                size={24}
              />
              <div className={styles.requestBody}>
                <div className={styles.commentHead}>
                  <strong>{r.summary}</strong>
                  <Badge color={r.tone}>{r.statusLabel}</Badge>
                </div>
                <p className={styles.muted}>{r.metaText}</p>
                {r.note && <p className={styles.requestNote}>{r.note}</p>}
                {r.reviewText && <p className={styles.muted}>{r.reviewText}</p>}
                {(r.canReview || r.canWithdraw) && (
                  <div className={styles.row}>
                    {r.canReview && (
                      <>
                        <Button
                          size="small"
                          appearance="primary"
                          disabled={approve.pending}
                          aria-label={`Approve: ${r.summary}`}
                          onClick={() =>
                            approve
                              .run({ taskId, requestId: r.id })
                              .catch(() => {})
                          }
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          aria-label={`Reject: ${r.summary}`}
                          onClick={() => {
                            reject.reset()
                            setRejecting(r)
                          }}
                        >
                          Reject
                        </Button>
                      </>
                    )}
                    {r.canWithdraw && (
                      <Button
                        size="small"
                        appearance="subtle"
                        disabled={withdraw.pending}
                        aria-label={`Withdraw: ${r.summary}`}
                        onClick={() =>
                          withdraw
                            .run({ taskId, requestId: r.id })
                            .catch(() => {})
                        }
                      >
                        Withdraw
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
      <ConfirmDialog
        open={rejecting !== null}
        title="Reject this request?"
        confirmLabel="Reject"
        pending={reject.pending}
        onConfirm={confirmReject}
        onCancel={() => setRejecting(null)}
      >
        <p className={styles.muted}>{rejecting?.summary}</p>
        <Field
          label="Note for the requester"
          hint="Optional · up to 1,000 characters"
          validationMessage={reject.error?.message}
        >
          <Textarea
            rows={3}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
      </ConfirmDialog>
    </section>
  )
}
