import type { MemberList, TaskSummary } from "@app/api-client"
import type { DashboardTileVM, DashboardVM } from "@app/protocol"
import { defineView } from "../runtime.ts"
import { sessionQuery } from "../session/session.queries.ts"
import { addDays, todayISO } from "../shared/dates.ts"
import { CLOSED, STATUS_LABEL, STATUS_ORDER } from "../tasks/tasks.labels.ts"
import { normalizeFilter, taskListQuery } from "../tasks/tasks.queries.ts"
import { dueOf, toTaskRowVM } from "../tasks/tasks.vm.ts"
import { membersQuery } from "../workspace/members.queries.ts"

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

const isOpen = (t: TaskSummary) => !CLOSED.has(t.status)

/** Everything on the dashboard, aggregated from the task list (E7-S1). */
export function toDashboardVM(
  tasks: TaskSummary[],
  members: MemberList,
  userId: string,
  today: string,
  locale: string
): DashboardVM {
  const open = tasks.filter(isOpen)
  const weekEnd = addDays(today, 6)
  const mine = open.filter((t) => t.assignees.some((a) => a.id === userId))
  const overdue = open.filter((t) => t.dueDate !== null && t.dueDate < today)
  const week = open.filter(
    (t) => t.dueDate !== null && t.dueDate >= today && t.dueDate <= weekEnd
  )
  const review = tasks.filter(
    (t) => t.viewer.canManage && t.counts.pendingRequests > 0
  )
  const pending = review.reduce((n, t) => n + t.counts.pendingRequests, 0)
  const unassigned = open.filter((t) => t.assignees.length === 0)

  const tiles: DashboardTileVM[] = [
    {
      key: "mine",
      label: "My open tasks",
      value: mine.length,
      hint: "Assigned to you",
      tone: "brand",
      tasksSearch: "?mine=true",
    },
    {
      key: "overdue",
      label: "Overdue",
      value: overdue.length,
      hint: "Past their due date",
      tone: overdue.length ? "danger" : "subtle",
      tasksSearch: null,
    },
    {
      key: "week",
      label: "Due this week",
      value: week.length,
      hint: "Today and the next 6 days",
      tone: week.length ? "warning" : "subtle",
      tasksSearch: null,
    },
    {
      key: "review",
      label: "Awaiting your review",
      value: pending,
      hint: "Change requests on tasks you manage",
      tone: pending ? "informative" : "subtle",
      tasksSearch: null,
    },
    {
      key: "unassigned",
      label: "Unassigned",
      value: unassigned.length,
      hint: "Open tasks with no one on them",
      tone: "subtle",
      tasksSearch: null,
    },
  ]

  const upcoming = open
    .filter((t) => t.dueDate !== null && t.dueDate >= today)
    .sort(
      (a, b) =>
        (a.dueDate ?? "").localeCompare(b.dueDate ?? "") ||
        a.title.localeCompare(b.title)
    )
    .slice(0, 8)
    .map((t) => toTaskRowVM(t, today, locale))

  const reviewQueue = [...review]
    .sort(
      (a, b) =>
        b.counts.pendingRequests - a.counts.pendingRequests ||
        a.title.localeCompare(b.title)
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      pendingText: plural(t.counts.pendingRequests, "request"),
      dueText: dueOf(t.dueDate, t.status, today, locale).dueText,
    }))

  const total = tasks.length
  const statusCounts = STATUS_ORDER.map((status) => {
    const count = tasks.filter((t) => t.status === status).length
    return {
      status,
      label: STATUS_LABEL[status],
      count,
      percent: total ? Math.round((count / total) * 100) : 0,
    }
  })

  const load = members.members.map((m) => {
    const theirs = open.filter((t) => t.assignees.some((a) => a.id === m.id))
    const late = theirs.filter(
      (t) => t.dueDate !== null && t.dueDate < today
    ).length
    return { m, openCount: theirs.length, late }
  })
  const max = Math.max(1, ...load.map((l) => l.openCount))
  const workload = load
    .sort(
      (a, b) => b.openCount - a.openCount || a.m.name.localeCompare(b.m.name)
    )
    .map(({ m, openCount, late }) => ({
      id: m.id,
      name: m.name,
      image: m.image,
      openCount,
      text: late ? `${openCount} open · ${late} overdue` : `${openCount} open`,
      percent: Math.round((openCount / max) * 100),
    }))

  return {
    tiles,
    upcoming,
    upcomingEmptyText: "Nothing due soon.",
    reviewQueue,
    reviewEmptyText: "No requests are waiting for you.",
    statusCounts,
    totalText: plural(total, "task"),
    workload,
  }
}

export const dashboardViews = {
  "dashboard.summary": defineView({
    queries: (_p: Record<string, never>, ctx) => ({
      tasks: taskListQuery(ctx.api, normalizeFilter({})),
      members: membersQuery(ctx.api),
      session: sessionQuery(ctx.api),
    }),
    compute: ({ tasks, members, session }, _p, ctx) =>
      toDashboardVM(
        tasks,
        members,
        session.user?.id ?? "",
        todayISO(ctx.now()),
        ctx.locale
      ),
  }),
}
