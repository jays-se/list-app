import type {
  LabelColorKey,
  OptionVM,
  PriorityKey,
  TaskStatusKey,
  Tone,
} from "@app/protocol"

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

/** Swatches for dropdowns and the home page status bar. */
export const STATUS_COLOR: Record<TaskStatusKey, LabelColorKey> = {
  BACKLOG: "gray",
  TODO: "blue",
  IN_PROGRESS: "purple",
  TESTING: "yellow",
  DONE: "green",
  CANCELED: "red",
}

export const PRIORITY_COLOR: Record<PriorityKey, LabelColorKey> = {
  URGENT: "red",
  HIGH: "orange",
  MEDIUM: "yellow",
  LOW: "blue",
  NONE: "gray",
}

/** Statuses where a past due date no longer matters. */
export const CLOSED: ReadonlySet<TaskStatusKey> = new Set(["DONE", "CANCELED"])

export const statusOptions: OptionVM<TaskStatusKey>[] = STATUS_ORDER.map(
  (value) => ({
    value,
    label: STATUS_LABEL[value],
    color: STATUS_COLOR[value],
  })
)

export const priorityOptions: OptionVM<PriorityKey>[] = PRIORITY_ORDER.map(
  (value) => ({
    value,
    label: PRIORITY_LABEL[value],
    color: PRIORITY_COLOR[value],
  })
)

export function isStatus(v: string): v is TaskStatusKey {
  return (STATUS_ORDER as string[]).includes(v)
}
