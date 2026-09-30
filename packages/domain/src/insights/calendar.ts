import type { TaskSummary } from "@app/api-client"
import type { CalendarDayVM, CalendarTaskVM, CalendarVM } from "@app/protocol"
import { defineView } from "../runtime.ts"
import { addDays, formatDate, todayISO, weekday } from "../shared/dates.ts"
import { CLOSED, STATUS_LABEL } from "../tasks/tasks.labels.ts"
import { normalizeFilter, taskListQuery } from "../tasks/tasks.queries.ts"
import { toTaskRowVM } from "../tasks/tasks.vm.ts"

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/
const MAX_PER_DAY = 3

/** First day of the week for a locale: 0 = Sunday, 1 = Monday. */
export function weekStart(locale: string): number {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & {
      getWeekInfo?: () => { firstDay: number }
      weekInfo?: { firstDay: number }
    }
    const info = l.getWeekInfo?.() ?? l.weekInfo
    if (info?.firstDay) return info.firstDay % 7
  } catch {
    // unknown locale: fall through
  }
  return /-US$/i.test(locale) ? 0 : 1
}

export function shiftMonth(month: string, by: number): string {
  const [y, m] = month.split("-").map(Number) as [number, number]
  const d = new Date(Date.UTC(y, m - 1 + by, 1))
  return d.toISOString().slice(0, 7)
}

function taskVM(t: TaskSummary, today: string): CalendarTaskVM {
  const done = CLOSED.has(t.status)
  const late = !done && t.dueDate !== null && t.dueDate < today
  return {
    id: t.id,
    title: t.title,
    tone: done ? "subtle" : late ? "danger" : "brand",
    done,
    ariaLabel: `${t.title} · ${STATUS_LABEL[t.status]}${late ? " · Overdue" : ""}`,
    clientColor: t.client?.color ?? null,
  }
}

/** Month grid by due date plus open undated tasks (E7-S2). */
export function toCalendarVM(
  tasks: TaskSummary[],
  monthParam: string | undefined,
  today: string,
  locale: string
): CalendarVM {
  const thisMonth = today.slice(0, 7)
  const month = monthParam && MONTH.test(monthParam) ? monthParam : thisMonth
  const first = `${month}-01`
  const start = weekStart(locale)
  const gridStart = addDays(first, -((weekday(first) - start + 7) % 7))
  const nextFirst = `${shiftMonth(month, 1)}-01`

  const byDay = new Map<string, TaskSummary[]>()
  for (const t of tasks) {
    if (!t.dueDate) continue
    const list = byDay.get(t.dueDate) ?? []
    list.push(t)
    byDay.set(t.dueDate, list)
  }

  const weeks: CalendarVM["weeks"] = []
  for (let day = gridStart; day < nextFirst; ) {
    const days: CalendarDayVM[] = []
    for (let i = 0; i < 7; i++, day = addDays(day, 1)) {
      const due = (byDay.get(day) ?? []).sort(
        (a, b) =>
          Number(CLOSED.has(a.status)) - Number(CLOSED.has(b.status)) ||
          a.title.localeCompare(b.title)
      )
      const long = formatDate(day, locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      })
      days.push({
        date: day,
        dayText: String(Number(day.slice(8))),
        ariaLabel: due.length
          ? `${long}, ${due.length} ${due.length === 1 ? "task" : "tasks"}`
          : long,
        inMonth: day.startsWith(month),
        isToday: day === today,
        tasks: due.slice(0, MAX_PER_DAY).map((t) => taskVM(t, today)),
        moreText:
          due.length > MAX_PER_DAY ? `+${due.length - MAX_PER_DAY} more` : null,
      })
    }
    weeks.push({ key: days[0]?.date ?? day, days })
  }

  const weekdays = Array.from({ length: 7 }, (_, i) => {
    const d = weeks[0]?.days[i]?.date ?? first
    return {
      short: formatDate(d, locale, { weekday: "short" }),
      long: formatDate(d, locale, { weekday: "long" }),
    }
  })

  const undated = tasks
    .filter((t) => !t.dueDate && !CLOSED.has(t.status))
    .map((t) => toTaskRowVM(t, today, locale))

  return {
    month,
    monthLabel: formatDate(first, locale, { month: "long", year: "numeric" }),
    prevMonth: shiftMonth(month, -1),
    nextMonth: shiftMonth(month, 1),
    thisMonth,
    isThisMonth: month === thisMonth,
    weekdays,
    weeks,
    undated,
    undatedText: undated.length
      ? `${undated.length} open ${undated.length === 1 ? "task" : "tasks"} without a due date`
      : "Every open task has a due date.",
  }
}

export const calendarViews = {
  "calendar.month": defineView({
    queries: (_p: { month?: string }, ctx) => ({
      tasks: taskListQuery(ctx.api, normalizeFilter({})),
    }),
    compute: ({ tasks }, params, ctx) =>
      toCalendarVM(tasks, params.month, todayISO(ctx.now()), ctx.locale),
  }),
}
