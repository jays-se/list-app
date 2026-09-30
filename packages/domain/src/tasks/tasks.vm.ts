import type { Label, MemberList, Task, TaskSummary } from "@app/api-client"
import type {
  LabelVM,
  PersonVM,
  TaskDetailVM,
  TaskDraft,
  TaskFormOptionsVM,
  TaskGroupVM,
  TaskListVM,
  TaskRowVM,
  TaskStatusKey,
  Tone,
} from "@app/protocol"
import {
  daysBetween,
  formatDay,
  formatLongDate,
  formatRange,
} from "../shared/dates.ts"
import {
  CLOSED,
  PRIORITY_LABEL,
  PRIORITY_TONE,
  priorityOptions,
  STATUS_LABEL,
  STATUS_ORDER,
  statusOptions,
} from "./tasks.labels.ts"
import type { TaskFilter } from "./tasks.queries.ts"

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

/** Due text + tone. Closed tasks are never "overdue". */
export function dueOf(
  due: string | null,
  status: TaskStatusKey,
  today: string,
  locale: string
): { dueText: string | null; dueTone: Tone } {
  if (!due) return { dueText: null, dueTone: "subtle" }
  const day = formatDay(due, today, locale)
  if (CLOSED.has(status)) return { dueText: `Due ${day}`, dueTone: "subtle" }
  const days = daysBetween(today, due)
  if (days < 0)
    return { dueText: `Overdue by ${plural(-days, "day")}`, dueTone: "danger" }
  if (days === 0) return { dueText: "Due today", dueTone: "warning" }
  if (days === 1) return { dueText: "Due tomorrow", dueTone: "warning" }
  return { dueText: `Due ${day}`, dueTone: days < 7 ? "informative" : "subtle" }
}

function assigneesText(people: PersonVM[]): string {
  if (people.length === 0) return "Unassigned"
  const first = people.slice(0, 2).map((p) => p.name.split(/\s+/)[0])
  return people.length > 2
    ? `${first.join(", ")} +${people.length - 2}`
    : first.join(", ")
}

export function toTaskRowVM(
  t: TaskSummary,
  today: string,
  locale: string
): TaskRowVM {
  return {
    id: t.id,
    title: t.title,
    statusLabel: STATUS_LABEL[t.status],
    priority: t.priority,
    priorityLabel: PRIORITY_LABEL[t.priority],
    priorityTone: PRIORITY_TONE[t.priority],
    ...dueOf(t.dueDate, t.status, today, locale),
    dateRangeText: formatRange(t.startDate, t.endDate, today, locale),
    assignees: t.assignees,
    assigneesText: assigneesText(t.assignees),
    labels: t.labels,
  }
}

export function toTaskListVM(
  tasks: TaskSummary[],
  filter: TaskFilter,
  members: MemberList,
  labels: Label[],
  today: string,
  locale: string
): TaskListVM {
  const byStatus = new Map<TaskStatusKey, TaskRowVM[]>()
  for (const t of tasks) {
    const rows = byStatus.get(t.status) ?? []
    rows.push(toTaskRowVM(t, today, locale))
    byStatus.set(t.status, rows)
  }
  const groups: TaskGroupVM[] = []
  for (const status of STATUS_ORDER) {
    const rows = byStatus.get(status)
    if (!rows?.length) continue
    groups.push({
      status,
      label: STATUS_LABEL[status],
      countText: String(rows.length),
      tasks: rows,
    })
  }
  const activeCount =
    Number(Boolean(filter.status)) +
    Number(filter.mine || Boolean(filter.assigneeId)) +
    Number(Boolean(filter.labelId))
  return {
    groups,
    totalText: plural(tasks.length, "task"),
    isEmpty: tasks.length === 0,
    emptyTitle: activeCount ? "No matching tasks" : "No tasks yet",
    emptyText: activeCount
      ? "Try removing a filter."
      : "Create the first task for your team.",
    filters: {
      statusOptions: [{ value: "", label: "All statuses" }, ...statusOptions],
      assigneeOptions: [
        { value: "", label: "Anyone" },
        ...members.members.map((m) => ({ value: m.id, label: m.name })),
      ],
      labelOptions: [
        { value: "", label: "Any label" },
        ...labels.map((l) => ({ value: l.id, label: l.name })),
      ],
      applied: { ...filter },
      activeCount,
    },
  }
}

function people(members: MemberList): PersonVM[] {
  return members.members.map((m) => ({
    id: m.id,
    name: m.name,
    image: m.image,
  }))
}

export function toFormOptionsVM(
  members: MemberList,
  labels: Label[],
  today: string
): TaskFormOptionsVM {
  return {
    statusOptions,
    priorityOptions,
    members: people(members),
    labels: labels as LabelVM[],
    defaults: {
      title: "",
      description: "",
      status: "TODO",
      priority: "NONE",
      startDate: today,
      endDate: today,
      dueDate: "",
      assigneeIds: [],
      labelIds: [],
      ownerIds: [],
    },
  }
}

const sortedIds = (xs: { id: string }[]) => xs.map((x) => x.id).sort()

export function draftFromTask(t: Task): TaskDraft {
  return {
    title: t.title,
    description: t.description ?? "",
    status: t.status,
    priority: t.priority,
    startDate: t.startDate,
    endDate: t.endDate,
    dueDate: t.dueDate ?? "",
    assigneeIds: sortedIds(t.assignees),
    labelIds: sortedIds(t.labels),
    ownerIds: sortedIds(t.owners),
  }
}

export function toTaskDetailVM(
  t: Task,
  members: MemberList,
  labels: Label[],
  today: string,
  locale: string
): TaskDetailVM {
  const options = toFormOptionsVM(members, labels, today)
  return {
    id: t.id,
    title: t.title,
    description: t.description,
    statusLabel: STATUS_LABEL[t.status],
    priorityLabel: PRIORITY_LABEL[t.priority],
    priorityTone: PRIORITY_TONE[t.priority],
    dateRangeText: formatRange(t.startDate, t.endDate, today, locale),
    ...dueOf(t.dueDate, t.status, today, locale),
    assignees: t.assignees,
    owners: t.owners,
    labels: t.labels,
    createdText: `Created by ${t.createdBy.name} on ${formatLongDate(t.createdAt, locale)}`,
    updatedText: `Updated ${formatLongDate(t.updatedAt, locale)}`,
    mode: t.viewer.canManage ? "manage" : "view",
    canManageOwners: t.viewer.canManageOwners,
    version: t.version,
    saved: draftFromTask(t),
    options,
    ownerCandidates: options.members.filter((p) => p.id !== t.createdBy.id),
  }
}
