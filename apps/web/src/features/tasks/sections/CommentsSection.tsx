import { useAction } from "@app/bridge"
import type { TaskDetailVM } from "@app/protocol"
import { Avatar, Button, Dropdown, Field, Textarea } from "@app/ui-kit"
import { type FormEvent, useState } from "react"
import styles from "./sections.module.css"

/** Anyone in the workspace can comment; mentions are picked, not parsed. */
export function CommentsSection({ vm }: { vm: TaskDetailVM }) {
  const add = useAction("comments.add")
  const [body, setBody] = useState("") // draft
  const [mentionIds, setMentionIds] = useState<string[]>([])

  function mention(id: string) {
    const person = vm.options.members.find((m) => m.id === id)
    if (!person) return
    setBody((b) => `${b}${b && !b.endsWith(" ") ? " " : ""}@${person.name} `)
    setMentionIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    try {
      await add.run({ taskId: vm.id, body, mentionIds })
      setBody("")
      setMentionIds([])
    } catch {
      // add.error shown below
    }
  }

  return (
    <section className={styles.section} aria-labelledby="comments-title">
      <h3 id="comments-title" className={styles.heading}>
        Comments <span className={styles.count}>{vm.comments.length}</span>
      </h3>
      {vm.comments.length === 0 && (
        <p className={styles.muted}>No comments yet.</p>
      )}
      <ul className={styles.list}>
        {vm.comments.map((c) => (
          <li key={c.id} className={styles.comment}>
            <Avatar
              name={c.authorName}
              image={c.authorImage ?? undefined}
              size={24}
            />
            <span className={styles.commentHead}>
              <strong>{c.authorName}</strong>
              <span className={styles.muted}>{c.timeText}</span>
            </span>
            <p className={styles.commentBody}>
              {c.segments.map((s, i) =>
                s.mention ? (
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                  <mark key={i} className={styles.mention}>
                    {s.text}
                  </mark>
                ) : (
                  // biome-ignore lint/suspicious/noArrayIndexKey: segments are positional
                  <span key={i}>{s.text}</span>
                )
              )}
            </p>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} noValidate className={styles.list}>
        <Field label="Add a comment" validationMessage={add.error?.message}>
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => {
              setBody(e.target.value)
              add.reset()
            }}
          />
        </Field>
        <div className={styles.row}>
          <span className={styles.mentionPicker}>
            <Dropdown
              size="small"
              aria-label="Mention someone"
              value=""
              placeholder="@ Mention someone…"
              options={vm.options.members.map((m) => ({
                value: m.id,
                label: m.name,
                media: (
                  <Avatar
                    name={m.name}
                    image={m.image ?? undefined}
                    size={20}
                  />
                ),
              }))}
              onChange={(id) => mention(id)}
            />
          </span>
          <span className={styles.grow} />
          <Button type="submit" appearance="primary" disabled={add.pending}>
            {add.pending ? "Posting…" : "Comment"}
          </Button>
        </div>
      </form>
    </section>
  )
}
