import {
  type ApiClient,
  decodeLabelList,
  decodeTaskList,
  decodeTaskResponse,
  type LabelList,
  type Task,
  type TaskSummary,
} from "@app/api-client"
import type { TaskListParams } from "@app/protocol"
import type { QueryOptions } from "@app/query"
import { isStatus } from "./tasks.labels.ts"

export const taskKeys = {
  all: ["tasks"] as const,
  lists: ["tasks", "list"] as const,
  list: (f: TaskFilter) => ["tasks", "list", f] as const,
  detail: (id: string) => ["tasks", "detail", id] as const,
}

export const labelKeys = { all: ["labels"] as const }

/** URL params → a normalized filter (invalid values dropped). */
export interface TaskFilter {
  status: string
  mine: boolean
  assigneeId: string
  labelId: string
}

export function normalizeFilter(p: TaskListParams): TaskFilter {
  const mine = p.mine === "true"
  return {
    status: p.status && isStatus(p.status) ? p.status : "",
    mine,
    assigneeId: mine ? "" : (p.assigneeId ?? ""),
    labelId: p.labelId ?? "",
  }
}

function toQueryString(f: TaskFilter): string {
  const q = new URLSearchParams()
  if (f.status) q.set("status", f.status)
  if (f.mine) q.set("mine", "true")
  if (f.assigneeId) q.set("assigneeId", f.assigneeId)
  if (f.labelId) q.set("labelId", f.labelId)
  const s = q.toString()
  return s ? `?${s}` : ""
}

/** Reference cadence: task lists poll every 15 s. */
export function taskListQuery(
  api: ApiClient,
  f: TaskFilter
): QueryOptions<TaskSummary[]> {
  return {
    key: taskKeys.list(f),
    ttl: 10_000,
    refetchInterval: 15_000,
    fetcher: async ({ signal }) =>
      decodeTaskList(await api.get(`/tasks${toQueryString(f)}`, { signal }))
        .tasks,
  }
}

/** Reference cadence: task detail polls every 10 s. */
export function taskDetailQuery(
  api: ApiClient,
  id: string
): QueryOptions<Task> {
  return {
    key: taskKeys.detail(id),
    ttl: 5_000,
    refetchInterval: 10_000,
    retry: 0,
    fetcher: async ({ signal }) =>
      decodeTaskResponse(
        await api.get(`/tasks/${encodeURIComponent(id)}`, { signal })
      ).task,
  }
}

export function labelsQuery(api: ApiClient): QueryOptions<LabelList> {
  return {
    key: labelKeys.all,
    // Teammates add labels too: show cached, revalidate on open.
    ttl: 0,
    fetcher: async ({ signal }) =>
      decodeLabelList(await api.get("/labels", { signal })),
  }
}
