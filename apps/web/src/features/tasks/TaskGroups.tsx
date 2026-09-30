import type { TaskGroupVM, TaskRowVM } from "@app/protocol"
import { Avatar, Badge, LabelChip } from "@app/ui-kit"
import { Link } from "react-router"
import styles from "./TaskGroups.module.css"

export function TaskGroups({
  groups,
  search,
}: {
  groups: TaskGroupVM[]
  search: URLSearchParams
}) {
  return (
    <div className={styles.groups}>
      {groups.map((g) => (
        <section
          key={g.status}
          className={styles.group}
          aria-labelledby={`group-${g.status}`}
        >
          <h2 id={`group-${g.status}`} className={styles.groupTitle}>
            {g.label} <span className={styles.groupCount}>{g.countText}</span>
          </h2>
          <ul className={styles.rows}>
            {g.tasks.map((t) => (
              <TaskRow key={t.id} task={t} search={search} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function TaskRow({
  task,
  search,
}: {
  task: TaskRowVM
  search: URLSearchParams
}) {
  const next = new URLSearchParams(search)
  next.set("task", task.id)
  return (
    <li>
      <Link to={{ search: `?${next}` }} className={styles.row}>
        <span className={styles.main}>
          <span className={styles.title}>{task.title}</span>
          <span className={styles.meta}>
            <span>{task.dateRangeText}</span>
            {task.labels.map((l) => (
              <LabelChip key={l.id} color={l.color} size="small">
                {l.name}
              </LabelChip>
            ))}
          </span>
        </span>
        <span className={styles.badges}>
          {task.priority !== "NONE" && (
            <Badge color={task.priorityTone}>{task.priorityLabel}</Badge>
          )}
          {task.dueText && (
            <Badge color={task.dueTone} appearance="outline">
              {task.dueText}
            </Badge>
          )}
        </span>
        <span className={styles.people}>
          <span className="visually-hidden">
            Assignees: {task.assigneesText}
          </span>
          <span className={styles.avatars} aria-hidden="true">
            {task.assignees.slice(0, 3).map((p) => (
              <Avatar
                key={p.id}
                name={p.name}
                image={p.image ?? undefined}
                size={24}
              />
            ))}
          </span>
        </span>
      </Link>
    </li>
  )
}
