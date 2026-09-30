import type { MemberList, TaskSummary } from "@app/api-client"
import type {
  DashboardTileVM,
  DashboardVM,
  MyWorkTabKey,
  MyWorkTabVM,
} from "@app/protocol"
import { defineView } from "../runtime.ts"
import { sessionQuery } from "../session/session.queries.ts"
import { addDays, todayISO } from "../shared/dates.ts"
import {
  CLOSED,
  STATUS_COLOR,
  STATUS_LABEL,
  STATUS_ORDER,
} from "../tasks/tasks.labels.ts"
import { normalizeFilter, taskListQuery } from "../tasks/tasks.queries.ts"
import { dueOf, toTaskRowVM } from "../tasks/tasks.vm.ts"
import { membersQuery } from "../workspace/members.queries.ts"

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

const isOpen = (t: TaskSummary) => !CLOSED.has(t.status)

const byDue = (a: TaskSummary, b: TaskSummary) =>
  (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999") ||
  a.title.localeCompare(b.title)

/** "Good morning, Ada" by the local hour. */
export function greeting(firstName: string, hour: number | null): string {
  const part =
    hour === null
      ? "Welcome"
      : hour < 5
        ? "Good evening"
        : hour < 12
          ? "Good morning"
          : hour < 18
            ? "Good afternoon"
            : "Good evening"
  return firstName ? `${part}, ${firstName}` : part
}

/** My open tasks split by when they're due (the home page tabs). */
export function toMyWork(
  mine: TaskSummary[],
  today: string,
  locale: string
): MyWorkTabVM[] {
  const weekEnd = addDays(today, 6)
  const buckets: Record<MyWorkTabKey, TaskSummary[]> = {
    overdue: [],
    today: [],
    week: [],
    later: [],
  }
  for (const t of mine) {
    const d = t.dueDate
    if (d !== null && d < today) buckets.overdue.push(t)
    else if (d === today) buckets.today.push(t)
    else if (d !== null && d <= weekEnd) buckets.week.push(t)
    else buckets.later.push(t)
  }
  const tab = (
    key: MyWorkTabKey,
    label: string,
    emptyText: string
  ): MyWorkTabVM => ({
    key,
    label,
    count: buckets[key].length,
    tasks: [...buckets[key]]
      .sort(byDue)
      .map((t) => toTaskRowVM(t, today, locale)),
    emptyText,
  })
  return [
    tab("overdue", "Overdue", "Nothing overdue. Nice work."),
    tab("today", "Due today", "Nothing due today."),
    tab("week", "Next 7 days", "Nothing due in the next week."),
    tab("later", "Later", "No other open tasks assigned to you."),
  ]
}

/** Everything on the dashboard, aggregated from the task list (E7-S1). */
export function toDashboardVM(
  tasks: TaskSummary[],
  members: MemberList,
  userId: string,
  today: string,
  locale: string,
  extra: { firstName?: string; now?: number } = {}
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
      color: STATUS_COLOR[status],
    }
  })
  const done = tasks.filter((t) => t.status === "DONE").length
  const myWork = toMyWork(mine, today, locale)

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
    greetingText: greeting(
      extra.firstName ?? "",
      extra.now === undefined ? null : new Date(extra.now).getHours()
    ),
    dateText: new Intl.DateTimeFormat(locale, {
      weekday: "long",
      day: "numeric",
      month: "long",
      timeZone: "UTC",
    }).format(Date.parse(`${today}T12:00:00Z`)),
    tiles,
    myWork,
    myWorkDefault: myWork.find((t) => t.count > 0)?.key ?? "today",
    donePercent: total ? Math.round((done / total) * 100) : 0,
    doneText: `${done} of ${plural(total, "task")} done`,
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
        ctx.locale,
        {
          firstName: session.user?.name.trim().split(/\s+/)[0] ?? "",
          now: ctx.now(),
        }
      ),
  }),
}
