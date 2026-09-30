import { useAction, useUploadProgress, useView } from "@app/bridge"
import {
  Button,
  ConfirmDialog,
  DismissIcon,
  Dropdown,
  Field,
  IconButton,
  Input,
  Spinner,
  Textarea,
} from "@app/ui-kit"
import { useEffect, useId, useRef, useState } from "react"
import { Link, useBlocker, useNavigate, useParams } from "react-router"
import { swatchOptions } from "../tasks/pickers.tsx"
import styles from "./Docs.module.css"
import { Markdown } from "./Markdown.tsx"

/** `/docs/:docId`: markdown editor with live preview and autosave (E11-S2). */
export function DocPage() {
  const { docId = "" } = useParams()
  const detail = useView("docs.detail", { docId })
  const edit = useAction("docs.edit")
  const flush = useAction("docs.flush")
  const reload = useAction("docs.reload")
  const remove = useAction("docs.delete")
  const navigate = useNavigate()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const vm = detail.data
  const pending = Boolean(vm?.hasPendingChanges)

  // Warn before leaving with unsaved edits: in-app navigation and tab close.
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      pending && currentLocation.pathname !== nextLocation.pathname
  )
  useEffect(() => {
    if (!pending) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [pending])

  const send = (change: {
    title?: string
    content?: string
    clientId?: string
  }) => edit.run({ docId, ...change }).catch(() => {})

  async function confirmRemove() {
    try {
      await remove.run({ docId })
      navigate("/docs")
    } catch {
      setConfirmDelete(false)
    }
  }

  if (!vm) {
    return (
      <div className={styles.page}>
        <Link to="/docs">← All docs</Link>
        {detail.error ? (
          <p role="alert" className={styles.error}>
            {detail.error.code === "HTTP_404"
              ? "This doc no longer exists."
              : detail.error.message}
          </p>
        ) : (
          <Spinner label="Loading doc" />
        )}
      </div>
    )
  }

  return (
    <div className={styles.page}>
      <div className={styles.topbar}>
        <Link to="/docs">← All docs</Link>
        <span
          role="status"
          className={
            vm.saveState === "error" || vm.saveState === "conflict"
              ? styles.error
              : styles.muted
          }
        >
          {vm.saveText}
        </span>
        {vm.saveState === "conflict" && (
          <Button
            size="small"
            onClick={() => reload.run({ docId }).catch(() => {})}
          >
            Reload latest
          </Button>
        )}
        {vm.saveState === "unsaved" && (
          <Button
            size="small"
            onClick={() => flush.run({ docId }).catch(() => {})}
          >
            Save now
          </Button>
        )}
      </div>

      {/* Uncontrolled + keyed: typing stays local and instant; the worker holds the draft. */}
      <h1 className={styles.visuallyHidden}>{vm.title}</h1>
      <div key={vm.editorKey} className={styles.editorHead}>
        <Field label="Title">
          <Input
            defaultValue={vm.title}
            maxLength={200}
            className={styles.titleInput}
            onChange={(e) => send({ title: e.target.value })}
          />
        </Field>
        <Field label="Client">
          <Dropdown
            value={vm.clientId}
            options={swatchOptions(vm.clientOptions)}
            onChange={(clientId) => send({ clientId })}
          />
        </Field>
      </div>

      <div className={styles.editor}>
        <Field label="Markdown" hint={vm.wordCountText}>
          <Textarea
            key={vm.editorKey}
            defaultValue={vm.content}
            rows={20}
            className={styles.source}
            spellCheck
            onChange={(e) => send({ content: e.target.value })}
          />
        </Field>
        <section className={styles.preview} aria-label="Preview">
          {vm.blocks.length ? (
            <Markdown blocks={vm.blocks} />
          ) : (
            <p className={styles.muted}>Nothing to preview yet.</p>
          )}
        </section>
      </div>

      <DocFiles docId={docId} vm={vm} />

      <footer className={styles.footer}>
        <span className={styles.muted}>{vm.metaText}</span>
        {vm.canDelete && (
          <Button appearance="subtle" onClick={() => setConfirmDelete(true)}>
            Delete doc
          </Button>
        )}
      </footer>
      {remove.error && (
        <p role="alert" className={styles.error}>
          {remove.error.message}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete “${vm.title}”?`}
        confirmLabel="Delete"
        pending={remove.pending}
        onConfirm={confirmRemove}
        onCancel={() => setConfirmDelete(false)}
      >
        The doc and its files are deleted. This can't be undone.
      </ConfirmDialog>
      <ConfirmDialog
        open={blocker.state === "blocked"}
        title="Leave without saving?"
        confirmLabel="Leave anyway"
        cancelLabel="Stay"
        onConfirm={() => blocker.proceed?.()}
        onCancel={() => blocker.reset?.()}
      >
        {vm.saveState === "saving"
          ? "Your latest changes are still saving."
          : "Your latest changes haven't been saved."}
      </ConfirmDialog>
    </div>
  )
}

function DocFiles({
  docId,
  vm,
}: {
  docId: string
  vm: import("@app/protocol").DocDetailVM
}) {
  const attach = useAction("docs.attach")
  const removeFile = useAction("docs.removeFile")
  const uploads = useUploadProgress(docId)
  const input = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [failed, setFailed] = useState<{ filename: string; message: string }[]>(
    []
  )
  return (
    <section className={styles.files} aria-labelledby="files-title">
      <h2 id="files-title" className={styles.subtitle}>
        Files <span className={styles.muted}>{vm.filesText}</span>
      </h2>
      {vm.files.length > 0 && (
        <ul className={styles.fileList}>
          {vm.files.map((f) => (
            <li key={f.id} className={styles.fileRow}>
              <a href={f.downloadUrl} download className={styles.fileLink}>
                {f.filename}
              </a>
              <span className={styles.muted}>{f.sizeText}</span>
              <span className={`${styles.muted} ${styles.grow}`}>
                {f.metaText}
              </span>
              <IconButton
                size="small"
                appearance="subtle"
                icon={<DismissIcon size={16} />}
                aria-label={`Remove ${f.filename}`}
                onClick={() =>
                  removeFile.run({ docId, fileId: f.id }).catch(() => {})
                }
              />
            </li>
          ))}
        </ul>
      )}
      {uploads.length > 0 && (
        <ul className={styles.fileList} aria-label="Uploads">
          {uploads.map((u) => (
            <li key={u.uploadId} className={styles.fileRow}>
              <span className={styles.grow}>{u.filename}</span>
              {u.state === "failed" ? (
                <span role="alert" className={styles.error}>
                  {u.error}
                </span>
              ) : (
                <progress
                  max={100}
                  value={u.percent}
                  aria-label={`Uploading ${u.filename}`}
                />
              )}
            </li>
          ))}
        </ul>
      )}
      {(failed.length > 0 || removeFile.error) && (
        <p role="alert" className={styles.error}>
          {failed.map((f) => f.message).join(" · ") ||
            removeFile.error?.message}
        </p>
      )}
      {vm.canAttach && (
        <div>
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
                void attach
                  .run({ docId, files })
                  .then((r) => setFailed(r.failed))
                  .catch(() => {})
            }}
          />
          <Button
            onClick={() => input.current?.click()}
            disabled={attach.pending}
          >
            {attach.pending ? "Uploading…" : "Attach files"}
          </Button>
        </div>
      )}
    </section>
  )
}
