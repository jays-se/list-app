import { useAction, useUploadProgress } from "@app/bridge"
import type { TaskDetailVM } from "@app/protocol"
import { Button, DismissIcon, IconButton } from "@app/ui-kit"
import { useId, useRef } from "react"
import styles from "./sections.module.css"

/** Files go to the worker, which uploads them straight to storage (ADR-0022). */
export function AttachmentsSection({ vm }: { vm: TaskDetailVM }) {
  const upload = useAction("attachments.upload")
  const remove = useAction("attachments.delete")
  const uploads = useUploadProgress(vm.id)
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const canEdit = vm.mode === "manage"

  return (
    <section className={styles.section} aria-labelledby="attachments-title">
      <h3 id="attachments-title" className={styles.heading}>
        Attachments <span className={styles.count}>{vm.attachmentsText}</span>
      </h3>
      {vm.attachments.length > 0 && (
        <ul className={styles.list}>
          {vm.attachments.map((a) => (
            <li key={a.id} className={styles.row}>
              {/* A plain navigation (not fetch): the API redirects to a signed download. */}
              <a href={a.downloadUrl} className={styles.fileLink} download>
                {a.filename}
              </a>
              <span className={styles.muted}>{a.sizeText}</span>
              <span className={`${styles.muted} ${styles.grow}`}>
                {a.metaText}
              </span>
              {canEdit && (
                <IconButton
                  size="small"
                  appearance="subtle"
                  icon={<DismissIcon size={16} />}
                  aria-label={`Remove ${a.filename}`}
                  onClick={() =>
                    remove
                      .run({ taskId: vm.id, attachmentId: a.id })
                      .catch(() => {})
                  }
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {uploads.length > 0 && (
        <ul className={styles.list} aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.uploadId} className={styles.row}>
              <span className={styles.grow}>{u.filename}</span>
              {u.state === "failed" ? (
                <span role="alert" className={styles.error}>
                  {u.error}
                </span>
              ) : (
                <progress
                  className={styles.progress}
                  max={100}
                  value={u.percent}
                  aria-label={`Uploading ${u.filename}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {remove.error && (
        <p role="alert" className={styles.error}>
          {remove.error.message}
        </p>
      )}
      {vm.canAttach && (
        <div className={styles.row}>
          <input
            ref={input}
            id={inputId}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ""
              if (files.length)
                void upload.run({ taskId: vm.id, files }).catch(() => {})
            }}
          />
          <Button
            onClick={() => input.current?.click()}
            disabled={upload.pending}
          >
            {upload.pending ? "Uploading…" : "Attach files"}
          </Button>
          <label htmlFor={inputId} className={styles.muted}>
            Up to 5 files, 5 MB each
          </label>
        </div>
      )}
    </section>
  )
}
