/** Dashboard, calendar and quick capture views (E7, E10). */
import type { LabelColorKey, TaskRowVM, TaskStatusKey, Tone } from "./tasks.ts"

export type DashboardTileKey =
  | "mine"
  | "overdue"
  | "week"
  | "review"
  | "unassigned"

export interface DashboardTileVM {
  key: DashboardTileKey
  label: string
  value: number
  hint: string
  tone: Tone
  /** Search string for /tasks (e.g. "?mine=true"); null when not filterable. */
  tasksSearch: string | null
}

export interface ReviewItemVM {
  id: string
  title: string
  /** e.g. "2 requests". */
  pendingText: string
  dueText: string | null
}

export interface StatusCountVM {
  status: TaskStatusKey
  label: string
  count: number
  /** 0–100 share of all tasks, for a bar. */
  percent: number
}

export interface WorkloadVM {
  id: string
  name: string
  image: string | null
  openCount: number
  /** e.g. "4 open · 1 overdue". */
  text: string
  /** 0–100 relative to the busiest member. */
  percent: number
}

export interface DashboardVM {
  tiles: DashboardTileVM[]
  upcoming: TaskRowVM[]
  upcomingEmptyText: string
  reviewQueue: ReviewItemVM[]
  reviewEmptyText: string
  statusCounts: StatusCountVM[]
  totalText: string
  workload: WorkloadVM[]
}

export interface CalendarTaskVM {
  id: string
  title: string
  tone: Tone
  done: boolean
  /** e.g. "Launch · In progress · Overdue". */
  ariaLabel: string
  clientColor: LabelColorKey | null
}

export interface CalendarDayVM {
  date: string
  dayText: string
  /** e.g. "Thursday 1 October 2026, 2 tasks". */
  ariaLabel: string
  inMonth: boolean
  isToday: boolean
  tasks: CalendarTaskVM[]
  /** "+2 more" when more than three tasks are due. */
  moreText: string | null
}

export interface CalendarVM {
  /** "2026-10" */
  month: string
  monthLabel: string
  prevMonth: string
  nextMonth: string
  thisMonth: string
  isThisMonth: boolean
  weekdays: { short: string; long: string }[]
  weeks: { key: string; days: CalendarDayVM[] }[]
  undated: TaskRowVM[]
  undatedText: string
}

export type CaptureSource = "MEETING_NOTE" | "PERSONAL"

export interface CaptureLineVM {
  id: string
  text: string
}

export interface CaptureParseResult {
  /** Reused as the idempotency key base when creating. */
  batchId: string
  lines: CaptureLineVM[]
  /** e.g. "12 tasks from 15 lines (3 empty)". */
  summaryText: string
  /** Set when more than 100 lines were pasted (the rest are dropped). */
  warning: string | null
}
