import { useView } from "@app/bridge"
import { Avatar, Spinner } from "@app/ui-kit"
import styles from "./sections.module.css"

/** History (E6-S2): polled only while this tab is open. */
export function ActivityTab({ taskId }: { taskId: string }) {
  const history = useView("tasks.history", { taskId })
  if (!history.data) {
    return history.error ? (
      <p role="alert" className={styles.error}>
        {history.error.message}
      </p>
    ) : (
      <Spinner label="Loading activity" />
    )
  }
  const { items, stages } = history.data
  return (
    <div className={styles.list}>
      <section aria-labelledby="stages-title" className={styles.list}>
        <h3 id="stages-title" className={styles.heading}>
          Time in each status
        </h3>
        <ul className={styles.stages}>
          {stages.map((s) => (
            <li
              key={s.status}
              className={`${styles.stage} ${s.isCurrent ? styles.current : ""}`}
            >
              <strong>{s.label}</strong> · {s.durationText}
              {s.isCurrent && <span className={styles.muted}> (now)</span>}
            </li>
          ))}
        </ul>
      </section>
      <section aria-labelledby="timeline-title" className={styles.section}>
        <h3 id="timeline-title" className={styles.heading}>
          Activity
        </h3>
        <ol className={styles.timeline}>
          {items.map((i) => (
            <li key={i.id} className={styles.row}>
              <Avatar
                name={i.actorName}
                image={i.actorImage ?? undefined}
                size={24}
              />
              <span className={styles.grow}>
                <strong>{i.actorName}</strong> {i.text}
              </span>
              <span className={styles.muted}>{i.timeText}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  )
}
