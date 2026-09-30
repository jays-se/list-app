import { useAction, useView } from "@app/bridge"
import { Button, LabelChip, Spinner } from "@app/ui-kit"
import { useId, useRef, useState } from "react"
import { Link, useNavigate } from "react-router"
import styles from "./Docs.module.css"

/** `/docs`: every doc in the workspace, newest edit first (E11-S2). */
export function DocsPage() {
  const docs = useView("docs.list", {})
  const create = useAction("docs.create")
  const upload = useAction("docs.upload")
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const [failed, setFailed] = useState<{ filename: string; message: string }[]>(
    []
  )
  const vm = docs.data

  async function newDoc() {
    try {
      const { id } = await create.run({ title: "Untitled doc" })
      navigate(`/docs/${id}`)
    } catch {
      // create.error shown below
    }
  }

  async function uploadFiles(files: File[]) {
    try {
      const r = await upload.run({ files })
      setFailed(r.failed)
      if (r.ids.length === 1 && r.failed.length === 0)
        navigate(`/docs/${r.ids[0]}`)
    } catch {
      // upload.error shown below
    }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Docs</h1>
          {vm && <p className={styles.muted}>{vm.countText}</p>}
        </div>
        <div className={styles.actions}>
          <input
            ref={fileInput}
            id={inputId}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])]
              e.target.value = ""
              if (files.length) void uploadFiles(files)
            }}
          />
          <Button
            onClick={() => fileInput.current?.click()}
            disabled={upload.pending}
          >
            {upload.pending ? "Uploading…" : "Upload file"}
          </Button>
          <Button
            appearance="primary"
            onClick={newDoc}
            disabled={create.pending}
          >
            New doc
          </Button>
        </div>
      </header>
      <p className={styles.muted}>
        Markdown (.md) and text files become editable docs; other files up to 20
        MB are attached to a new doc.
      </p>
      {(create.error || upload.error) && (
        <p role="alert" className={styles.error}>
          {(create.error ?? upload.error)?.message}
        </p>
      )}
      {failed.length > 0 && (
        <ul role="alert" className={styles.errorList}>
          {failed.map((f) => (
            <li key={f.filename}>{f.message}</li>
          ))}
        </ul>
      )}
      {!vm && !docs.error && <Spinner label="Loading docs" />}
      {docs.error && !vm && (
        <p role="alert" className={styles.error}>
          {docs.error.message}
        </p>
      )}
      {vm?.isEmpty && <p className={styles.empty}>{vm.emptyText}</p>}
      {vm && !vm.isEmpty && <DocRows docs={vm.docs} />}
    </div>
  )
}

export function DocRows({
  docs,
}: {
  docs: import("@app/protocol").DocRowVM[]
}) {
  return (
    <ul className={styles.list} aria-label="Docs">
      {docs.map((d) => (
        <li key={d.id}>
          <Link to={`/docs/${d.id}`} className={styles.row}>
            <span className={styles.rowTitle}>{d.title}</span>
            {d.excerpt && <span className={styles.excerpt}>{d.excerpt}</span>}
            <span className={styles.meta}>
              {d.client && (
                <LabelChip color={d.client.color} size="small">
                  {d.client.name}
                </LabelChip>
              )}
              <span>{d.metaText}</span>
              {d.fileCountText && <span>{d.fileCountText}</span>}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
