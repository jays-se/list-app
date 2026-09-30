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
  client: { name: string; color: LabelColorKey } | null
  /** For subtasks: "Subtask of Launch". */
  parentText: string | null
  /** e.g. "2/3 subtasks · 1/4 checklist"; null when there is neither. */
  progressText: string | null
  commentCount: number
  attachmentCount: number
  /** e.g. "2 comments · 1 file"; null when neither. */
  activityText: string | null
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
  clientId?: string
}

export interface TaskFiltersVM {
  statusOptions: OptionVM[]
  assigneeOptions: OptionVM[]
  labelOptions: OptionVM[]
  clientOptions: OptionVM[]
  /** The filters actually applied (invalid values dropped). */
  applied: {
    status: string
    mine: boolean
    assigneeId: string
    labelId: string
    clientId: string
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
  /** "" = no client. */
  clientId: string
}

export interface TaskFormOptionsVM {
  statusOptions: OptionVM<TaskStatusKey>[]
  priorityOptions: OptionVM<PriorityKey>[]
  members: PersonVM[]
  labels: LabelVM[]
  clientOptions: OptionVM[]
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
  client: { id: string; name: string; color: LabelColorKey } | null
  parent: { id: string; title: string } | null
  subtasks: SubtaskVM[]
  subtasksText: string
  /** Subtasks can't have subtasks (one level). */
  canAddSubtask: boolean
  checklist: ChecklistItemVM[]
  checklistText: string
  comments: CommentVM[]
  attachments: AttachmentVM[]
  attachmentsText: string
  canAttach: boolean
}

export interface SubtaskVM {
  id: string
  title: string
  statusLabel: string
  isDone: boolean
}

export interface ChecklistItemVM {
  id: string
  title: string
  done: boolean
  assigneeId: string
  assigneeName: string | null
}

/** Comment body split so mentions can be highlighted without parsing in React. */
export interface CommentSegmentVM {
  text: string
  mention: boolean
}

export interface CommentVM {
  id: string
  authorName: string
  authorImage: string | null
  timeText: string
  segments: CommentSegmentVM[]
}

export interface AttachmentVM {
  id: string
  filename: string
  sizeText: string
  metaText: string
  downloadUrl: string
}

export interface HistoryItemVM {
  id: string
  actorName: string
  actorImage: string | null
  text: string
  timeText: string
}

export interface StatusStageVM {
  status: TaskStatusKey
  label: string
  durationText: string
  isCurrent: boolean
}

export interface TaskHistoryVM {
  items: HistoryItemVM[]
  stages: StatusStageVM[]
}

export interface ClientDraft {
  name: string
  email: string
  phone: string
  color: LabelColorKey
  notes: string
}

export interface ClientVM {
  id: string
  name: string
  email: string | null
  phone: string | null
  color: LabelColorKey
  notes: string | null
  taskCountText: string
}

export interface ClientsVM {
  clients: ClientVM[]
  canDelete: boolean
  colorOptions: OptionVM<LabelColorKey>[]
  emptyText: string
}

export interface ClientDetailVM {
  client: ClientVM
  saved: ClientDraft
  tasks: TaskRowVM[]
  tasksText: string
  canDelete: boolean
  colorOptions: OptionVM<LabelColorKey>[]
}

/** Pushed while the worker uploads a file (topic "upload.progress"). */
export interface UploadProgress {
  taskId: string
  uploadId: string
  filename: string
  /** 0–100. */
  percent: number
  state: "uploading" | "done" | "failed"
  error?: string
}

export interface LabelsVM {
  labels: (LabelVM & { canDelete: boolean })[]
  colorOptions: OptionVM<LabelColorKey>[]
  canDelete: boolean
}
