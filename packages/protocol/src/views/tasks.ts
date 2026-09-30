/** Task views (E4). Everything is display-ready; React only renders. */
export type TaskStatusKey =
  | "BACKLOG"
  | "TODO"
  | "IN_PROGRESS"
  | "TESTING"
  | "DONE"
  | "CANCELED"
export type PriorityKey = "URGENT" | "HIGH" | "MEDIUM" | "LOW" | "NONE"
export type LabelColorKey =
  | "gray"
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "teal"
  | "blue"
  | "purple"
  | "pink"
/** Maps onto ui-kit Badge colors. */
export type Tone =
  | "subtle"
  | "brand"
  | "danger"
  | "warning"
  | "success"
  | "informative"

export interface OptionVM<V extends string = string> {
  value: V
  label: string
}

export interface PersonVM {
  id: string
  name: string
  image: string | null
}

export interface LabelVM {
  id: string
  name: string
  color: LabelColorKey
}

export interface TaskRowVM {
  id: string
  title: string
  statusLabel: string
  priority: PriorityKey
  priorityLabel: string
  priorityTone: Tone
  /** e.g. "Due 9 Oct", "Due today", "Overdue by 2 days"; null when no due date. */
  dueText: string | null
  dueTone: Tone
  dateRangeText: string
  assignees: PersonVM[]
  /** "Ada, Grace +2" style summary for compact layouts. */
  assigneesText: string
  labels: LabelVM[]
}

export interface TaskGroupVM {
  status: TaskStatusKey
  label: string
  countText: string
  tasks: TaskRowVM[]
}

/** URL search params, as strings (the worker validates them). */
export interface TaskListParams {
  status?: string
  mine?: string
  assigneeId?: string
  labelId?: string
}

export interface TaskFiltersVM {
  statusOptions: OptionVM[]
  assigneeOptions: OptionVM[]
  labelOptions: OptionVM[]
  /** The filters actually applied (invalid values dropped). */
  applied: {
    status: string
    mine: boolean
    assigneeId: string
    labelId: string
  }
  activeCount: number
}

export interface TaskListVM {
  groups: TaskGroupVM[]
  totalText: string
  isEmpty: boolean
  emptyTitle: string
  emptyText: string
  filters: TaskFiltersVM
}

/** Everything a task form edits; strings so inputs bind directly. */
export interface TaskDraft {
  title: string
  description: string
  status: TaskStatusKey
  priority: PriorityKey
  startDate: string
  endDate: string
  /** "" = no due date. */
  dueDate: string
  assigneeIds: string[]
  labelIds: string[]
  ownerIds: string[]
}

export interface TaskFormOptionsVM {
  statusOptions: OptionVM<TaskStatusKey>[]
  priorityOptions: OptionVM<PriorityKey>[]
  members: PersonVM[]
  labels: LabelVM[]
  /** A fresh draft: dates default to today. */
  defaults: TaskDraft
}

export interface TaskDetailVM {
  id: string
  title: string
  description: string | null
  statusLabel: string
  priorityLabel: string
  priorityTone: Tone
  dateRangeText: string
  dueText: string | null
  dueTone: Tone
  assignees: PersonVM[]
  owners: PersonVM[]
  labels: LabelVM[]
  createdText: string
  updatedText: string
  /** "manage" = edit directly; "view" = read only (requests arrive in E5). */
  mode: "manage" | "view"
  canManageOwners: boolean
  version: number
  /** The saved values, to seed and compare a form draft. */
  saved: TaskDraft
  options: TaskFormOptionsVM
  /** Members who can be owners (everyone but the creator). */
  ownerCandidates: PersonVM[]
}

export interface LabelsVM {
  labels: (LabelVM & { canDelete: boolean })[]
  colorOptions: OptionVM<LabelColorKey>[]
  canDelete: boolean
}
