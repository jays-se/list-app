import type { OptionVM, PriorityKey, TaskStatusKey, Tone } from "@app/protocol"

export const STATUS_ORDER: TaskStatusKey[] = [
  "BACKLOG",
  "TODO",
  "IN_PROGRESS",
  "TESTING",
  "DONE",
  "CANCELED",
]

export const STATUS_LABEL: Record<TaskStatusKey, string> = {
  BACKLOG: "Backlog",
  TODO: "To do",
  IN_PROGRESS: "In progress",
  TESTING: "Testing & validation",
  DONE: "Done",
  CANCELED: "Canceled",
}

export const PRIORITY_ORDER: PriorityKey[] = [
  "URGENT",
  "HIGH",
  "MEDIUM",
  "LOW",
  "NONE",
]

export const PRIORITY_LABEL: Record<PriorityKey, string> = {
  URGENT: "Urgent",
  HIGH: "High",
  MEDIUM: "Medium",
  LOW: "Low",
  NONE: "No priority",
}

export const PRIORITY_TONE: Record<PriorityKey, Tone> = {
  URGENT: "danger",
  HIGH: "warning",
  MEDIUM: "informative",
  LOW: "subtle",
  NONE: "subtle",
}

/** Statuses where a past due date no longer matters. */
export const CLOSED: ReadonlySet<TaskStatusKey> = new Set(["DONE", "CANCELED"])

export const statusOptions: OptionVM<TaskStatusKey>[] = STATUS_ORDER.map(
  (value) => ({
    value,
    label: STATUS_LABEL[value],
  })
)

export const priorityOptions: OptionVM<PriorityKey>[] = PRIORITY_ORDER.map(
  (value) => ({
    value,
    label: PRIORITY_LABEL[value],
  })
)

export function isStatus(v: string): v is TaskStatusKey {
  return (STATUS_ORDER as string[]).includes(v)
}
