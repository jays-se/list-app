import { useAction } from "@app/bridge"
import type { CaptureLineVM, CaptureSource } from "@app/protocol"
import {
  Button,
  DismissIcon,
  Field,
  IconButton,
  Input,
  Select,
  Textarea,
} from "@app/ui-kit"
import { useState } from "react"
import { Link } from "react-router"
import { fieldError } from "../tasks/draft.ts"
import styles from "./CapturePage.module.css"

/**
 * Quick capture (E10-S1): paste notes, the worker splits them into lines,
 * the user edits the draft, then everything is created at once.
 */
export function CapturePage() {
  const parse = useAction("capture.parse")
  const create = useAction("capture.create")
  const [text, setText] = useState("")
  const [source, setSource] = useState<CaptureSource>("MEETING_NOTE")
  // The editable preview is an uncommitted draft (ADR-0005).
  const [batch, setBatch] = useState<{
    batchId: string
    summaryText: string
    warning: string | null
  } | null>(null)
  const [lines, setLines] = useState<CaptureLineVM[]>([])
  const [created, setCreated] = useState<number | null>(null)

  async function preview() {
    try {
      const r = await parse.run({ text })
      setBatch(r)
      setLines(r.lines)
      setCreated(null)
      create.reset()
    } catch {
      // parse.error shown below
    }
  }

  async function submit() {
    if (!batch) return
    try {
      const r = await create.run({ batchId: batch.batchId, source, lines })
      setCreated(r.created)
      setBatch(null)
      setLines([])
      setText("")
    } catch {
      // create.error shown per line / below
    }
  }

  const formError =
    create.error &&
    !create.error.fieldErrors?.some((f) => lines.some((l) => l.id === f.field))
      ? create.error.message
      : undefined

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Quick capture</h1>
        <p className={styles.lead}>
          Paste meeting notes or a to-do list. Each line becomes a task; bullets
          and numbering are removed.
        </p>
      </header>

      {created !== null && (
        <p role="status" className={styles.success}>
          Created {created} {created === 1 ? "task" : "tasks"}.{" "}
          <Link to="/tasks">View tasks</Link>
        </p>
      )}

      {!batch ? (
        <section className={styles.card} aria-label="Paste">
          <Field label="Notes" hint="One task per line">
            <Textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
          </Field>
          <SourceField source={source} onChange={setSource} />
          {parse.error && (
            <p role="alert" className={styles.error}>
              {parse.error.message}
            </p>
          )}
          <div className={styles.actions}>
            <Button
              appearance="primary"
              disabled={!text.trim() || parse.pending}
              onClick={preview}
            >
              Preview tasks
            </Button>
          </div>
        </section>
      ) : (
        <section className={styles.card} aria-labelledby="preview-title">
          <h2 id="preview-title" className={styles.cardTitle}>
            Review <span className={styles.muted}>{batch.summaryText}</span>
          </h2>
          {batch.warning && <p className={styles.warning}>{batch.warning}</p>}
          <ol className={styles.lines}>
            {lines.map((l, i) => (
              <li key={l.id} className={styles.line}>
                <Field
                  label={`Task ${i + 1}`}
                  validationMessage={fieldError(create.error, l.id)}
                >
                  <Input
                    value={l.text}
                    maxLength={600}
                    onChange={(e) => {
                      const value = e.target.value
                      setLines((xs) =>
                        xs.map((x) =>
                          x.id === l.id ? { ...x, text: value } : x
                        )
                      )
                    }}
                  />
                </Field>
                <IconButton
                  appearance="subtle"
                  icon={<DismissIcon size={16} />}
                  aria-label={`Remove task ${i + 1}`}
                  onClick={() =>
                    setLines((xs) => xs.filter((x) => x.id !== l.id))
                  }
                />
              </li>
            ))}
          </ol>
          <SourceField source={source} onChange={setSource} />
          {formError && (
            <p role="alert" className={styles.error}>
              {formError}
            </p>
          )}
          <div className={styles.actions}>
            <Button
              appearance="primary"
              disabled={lines.length === 0 || create.pending}
              onClick={submit}
            >
              {create.pending
                ? "Creating…"
                : `Create ${lines.length} ${lines.length === 1 ? "task" : "tasks"}`}
            </Button>
            <Button
              onClick={() => {
                setBatch(null)
                create.reset()
              }}
            >
              Back to notes
            </Button>
          </div>
        </section>
      )}
    </div>
  )
}

function SourceField({
  source,
  onChange,
}: {
  source: CaptureSource
  onChange: (s: CaptureSource) => void
}) {
  return (
    <Field
      label="Source"
      hint={
        source === "PERSONAL"
          ? "Personal tasks are assigned to you."
          : "Meeting-note tasks start unassigned."
      }
    >
      <Select
        value={source}
        onChange={(e) => onChange(e.target.value as CaptureSource)}
      >
        <option value="MEETING_NOTE">Meeting note</option>
        <option value="PERSONAL">Personal</option>
      </Select>
    </Field>
  )
}
