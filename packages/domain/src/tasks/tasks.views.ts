import type { TaskListParams } from "@app/protocol"
import { defineView } from "../runtime.ts"
import { todayISO } from "../shared/dates.ts"
import { membersQuery } from "../workspace/members.queries.ts"
import {
  clientsQuery,
  labelsQuery,
  normalizeFilter,
  taskDetailQuery,
  taskListQuery,
} from "./tasks.queries.ts"
import { toFormOptionsVM, toTaskDetailVM, toTaskListVM } from "./tasks.vm.ts"

export const taskViews = {
  "tasks.list": defineView({
    queries: (params: TaskListParams, ctx) => ({
      tasks: taskListQuery(ctx.api, normalizeFilter(params)),
      members: membersQuery(ctx.api),
      labels: labelsQuery(ctx.api),
      clients: clientsQuery(ctx.api),
    }),
    compute: ({ tasks, members, labels, clients }, params, ctx) =>
      toTaskListVM(
        tasks,
        normalizeFilter(params),
        members,
        labels.labels,
        clients,
        todayISO(ctx.now()),
        ctx.locale
      ),
  }),

  "tasks.detail": defineView({
    queries: (params: { taskId: string }, ctx) => ({
      task: taskDetailQuery(ctx.api, params.taskId),
      members: membersQuery(ctx.api),
      labels: labelsQuery(ctx.api),
      clients: clientsQuery(ctx.api),
    }),
    compute: ({ task, members, labels, clients }, _params, ctx) =>
      toTaskDetailVM(
        task,
        members,
        labels.labels,
        clients,
        todayISO(ctx.now()),
        ctx.now(),
        ctx.locale
      ),
  }),

  "tasks.formOptions": defineView({
    queries: (_params: Record<string, never>, ctx) => ({
      members: membersQuery(ctx.api),
      labels: labelsQuery(ctx.api),
      clients: clientsQuery(ctx.api),
    }),
    compute: ({ members, labels, clients }, _params, ctx) =>
      toFormOptionsVM(members, labels.labels, clients, todayISO(ctx.now())),
  }),
}
