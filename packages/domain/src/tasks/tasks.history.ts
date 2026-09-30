import {
  type ApiClient,
  decodeTaskHistory,
  type TaskEvent,
  type TaskHistory,
} from "@app/api-client"
import type { HistoryItemVM, StatusStageVM, TaskHistoryVM } from "@app/protocol"
import type { QueryOptions } from "@app/query"
import { defineView } from "../runtime.ts"
import { formatDay } from "../shared/dates.ts"
import { formatDuration, relativeTime } from "../shared/format.ts"
import { FORMER_MEMBER } from "./tasks.collab.vm.ts"
import { PRIORITY_LABEL, STATUS_LABEL } from "./tasks.labels.ts"

export const historyKey = (id: string) => ["tasks", "history", id] as const

export function historyQuery(
  api: ApiClient,
  id: string
): QueryOptions<TaskHistory> {
  return {
    key: historyKey(id),
    ttl: 0,
    refetchInterval: 10_000,
    fetcher: async ({ signal }) =>
      decodeTaskHistory(
        await api.get(`/tasks/${encodeURIComponent(id)}/history`, { signal })
      ),
  }
}

const q = (s: string | null) => `“${s ?? ""}”`
const label = (key: string | null, map: Record<string, string>) =>
  key ? (map[key] ?? key) : ""

const DATE_FIELDS: Record<string, string> = {
  startDate: "start date",
  endDate: "end date",
  dueDate: "due date",
}

function updatedText(e: TaskEvent, today: string, locale: string): string {
  const from = e.from
  const to = e.to
  switch (e.field) {
    case "title":
      return `renamed the task to ${q(to)}`
    case "description":
      return to ? "updated the description" : "removed the description"
    case "priority":
      return `changed priority from ${label(from, PRIORITY_LABEL)} to ${label(to, PRIORITY_LABEL)}`
    case "client":
      if (!from) return `linked client ${to}`
      if (!to) return `unlinked client ${from}`
      return `changed client from ${from} to ${to}`
    default: {
      const name = DATE_FIELDS[e.field ?? ""] ?? e.field ?? "a field"
      const day = (d: string | null) => (d ? formatDay(d, today, locale) : "")
      if (!from) return `set the ${name} to ${day(to)}`
      if (!to) return `cleared the ${name}`
      return `changed the ${name} from ${day(from)} to ${day(to)}`
    }
  }
}

/** One sentence per event, e.g. "changed status from To do to In progress". */
export function eventText(e: TaskEvent, today: string, locale: string): string {
  const s = e.subject
  switch (e.kind) {
    case "CREATED":
      return "created this task"
    case "STATUS":
      return `changed status from ${label(e.from, STATUS_LABEL)} to ${label(e.to, STATUS_LABEL)}`
    case "UPDATED":
      return updatedText(e, today, locale)
    case "ASSIGNEE_ADDED":
      return `assigned ${s}`
    case "ASSIGNEE_REMOVED":
      return `unassigned ${s}`
    case "LABEL_ADDED":
      return `added label ${s}`
    case "LABEL_REMOVED":
      return `removed label ${s}`
    case "OWNER_ADDED":
      return `made ${s} an owner`
    case "OWNER_REMOVED":
      return `removed ${s} as an owner`
    case "CHECKLIST_ADDED":
      return `added checklist item ${q(s)}`
    case "CHECKLIST_CHECKED":
      return `completed ${q(s)}`
    case "CHECKLIST_UNCHECKED":
      return `reopened ${q(s)}`
    case "CHECKLIST_RENAMED":
      return `renamed checklist item ${q(e.from)} to ${q(e.to)}`
    case "CHECKLIST_ASSIGNED":
      return `assigned ${q(s)} to ${e.to}`
    case "CHECKLIST_UNASSIGNED":
      return `unassigned ${q(s)}`
    case "CHECKLIST_REMOVED":
      return `removed checklist item ${q(s)}`
    case "COMMENTED":
      return `commented: ${q(s)}`
    case "ATTACHMENT_ADDED":
      return `attached ${s}`
    case "ATTACHMENT_REMOVED":
      return `removed attachment ${s}`
    case "SUBTASK_ADDED":
      return `added subtask ${q(s)}`
  }
}

/** Total time per status across all visits, in workflow order of first visit. */
export function stageDurations(h: TaskHistory, now: number): StatusStageVM[] {
  const totals = new Map<string, number>()
  const current = h.stages.find((s) => s.leftAt === null)?.status
  for (const s of h.stages) {
    const end = s.leftAt ? Date.parse(s.leftAt) : now
    totals.set(
      s.status,
      (totals.get(s.status) ?? 0) + Math.max(0, end - Date.parse(s.enteredAt))
    )
  }
  return [...totals].map(([status, ms]) => ({
    status: status as StatusStageVM["status"],
    label: STATUS_LABEL[status as StatusStageVM["status"]],
    durationText: formatDuration(ms),
    isCurrent: status === current,
  }))
}

export function toHistoryVM(
  h: TaskHistory,
  now: number,
  today: string,
  locale: string
): TaskHistoryVM {
  const items: HistoryItemVM[] = h.events.map((e) => ({
    id: e.id,
    actorName: e.actor?.name ?? FORMER_MEMBER,
    actorImage: e.actor?.image ?? null,
    text: eventText(e, today, locale),
    timeText: relativeTime(e.createdAt, now, locale),
  }))
  return { items, stages: stageDurations(h, now) }
}

export const historyViews = {
  "tasks.history": defineView({
    queries: (params: { taskId: string }, ctx) => ({
      history: historyQuery(ctx.api, params.taskId),
    }),
    compute: ({ history }, _p, ctx) =>
      toHistoryVM(
        history,
        ctx.now(),
        new Date(ctx.now()).toISOString().slice(0, 10),
        ctx.locale
      ),
  }),
}
