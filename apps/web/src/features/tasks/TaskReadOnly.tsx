import type { PersonVM, TaskDetailVM } from "@app/protocol"
import { Avatar, Badge, LabelChip } from "@app/ui-kit"
import styles from "./TaskReadOnly.module.css"

/**
 * What non-managers see. In request mode the requestable fields are in
 * RequestForm, so only the rest is listed here.
 */
export function TaskReadOnly({ vm }: { vm: TaskDetailVM }) {
  const requesting = vm.mode === "request"
  return (
    <div className={styles.root}>
      <p className={styles.notice}>
        {requesting
          ? "You're assigned to this task. Changes you make go to its creator and owners for approval."
          : "You can view this task. Its creator and owners can change it."}
      </p>
      <dl className={styles.facts}>
        {!requesting && (
          <>
            <dt>Status</dt>
            <dd>{vm.statusLabel}</dd>
          </>
        )}
        <dt>Priority</dt>
        <dd>
          <Badge color={vm.priorityTone}>{vm.priorityLabel}</Badge>
        </dd>
        {!requesting && (
          <>
            <dt>Dates</dt>
            <dd>
              {vm.dateRangeText}
              {vm.dueText && (
                <>
                  {" "}
                  <Badge color={vm.dueTone}>{vm.dueText}</Badge>
                </>
              )}
            </dd>
            <dt>Assignees</dt>
            <dd>
              <People people={vm.assignees} empty="Unassigned" />
            </dd>
          </>
        )}
        <dt>Owners</dt>
        <dd>
          <People people={vm.owners} empty="None" />
        </dd>
        <dt>Labels</dt>
        <dd className={styles.chips}>
          {vm.labels.length === 0
            ? "None"
            : vm.labels.map((l) => (
                <LabelChip key={l.id} color={l.color}>
                  {l.name}
                </LabelChip>
              ))}
        </dd>
      </dl>
      <h3 className={styles.heading}>Description</h3>
      <p className={styles.description}>
        {vm.description ?? "No description."}
      </p>
    </div>
  )
}

function People({ people, empty }: { people: PersonVM[]; empty: string }) {
  if (people.length === 0) return <>{empty}</>
  return (
    <ul className={styles.people}>
      {people.map((p) => (
        <li key={p.id} className={styles.person}>
          <Avatar name={p.name} image={p.image ?? undefined} size={20} />
          {p.name}
        </li>
      ))}
    </ul>
  )
}
