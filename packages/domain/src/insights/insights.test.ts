import type { MemberList, TaskSummary } from "@app/api-client"
import { describe, expect, it } from "vitest"
import { shiftMonth, toCalendarVM, weekStart } from "./calendar.ts"
import { toDashboardVM } from "./dashboard.ts"

const TODAY = "2026-10-07" // a Wednesday

let seq = 0
function task(over: Partial<TaskSummary> = {}): TaskSummary {
  seq++
  return {
    id: `t${seq}`,
    title: `Task ${seq}`,
    status: "TODO",
    priority: "NONE",
    startDate: "2026-10-01",
    endDate: "2026-10-01",
    dueDate: null,
    assignees: [],
    labels: [],
    createdBy: { id: "u1", name: "Ada", image: null },
    version: 1,
    updatedAt: "2026-10-01T00:00:00Z",
    client: null,
    parent: null,
    counts: {
      subtasks: 0,
      subtasksDone: 0,
      checklist: 0,
      checklistDone: 0,
      comments: 0,
      attachments: 0,
      pendingRequests: 0,
    },
    source: null,
    viewer: {
      canManage: false,
      canManageOwners: false,
      isAssignee: false,
      canRequest: false,
    },
    ...over,
  }
}
const ada = { id: "u1", name: "Ada", image: null }
const bob = { id: "u2", name: "Bob", image: null }
const members: MemberList = {
  members: [ada, bob].map((p) => ({
    ...p,
    email: "x@x",
    role: "MEMBER",
    joinedAt: "2026-09-01T00:00:00Z",
  })),
}

describe("dashboard", () => {
  const tasks = [
    task({ assignees: [ada], dueDate: "2026-10-01" }), // mine, overdue
    task({ assignees: [ada], dueDate: "2026-10-09" }), // mine, this week
    task({ assignees: [bob], dueDate: "2026-10-13" }), // this week (last day)
    task({ dueDate: "2026-10-14" }), // next week, unassigned
    task({ status: "DONE", assignees: [ada], dueDate: "2026-10-02" }), // closed
    task({
      title: "Review me",
      viewer: {
        canManage: true,
        canManageOwners: true,
        isAssignee: false,
        canRequest: false,
      },
      counts: { ...task().counts, pendingRequests: 2 },
    }),
    task({ counts: { ...task().counts, pendingRequests: 1 } }), // can't manage
  ]
  const vm = toDashboardVM(tasks, members, "u1", TODAY, "en-GB")

  it("counts the tiles", () => {
    expect(Object.fromEntries(vm.tiles.map((t) => [t.key, t.value]))).toEqual({
      mine: 2,
      overdue: 1,
      week: 2,
      review: 2,
      unassigned: 3,
    })
    expect(vm.tiles.find((t) => t.key === "overdue")?.tone).toBe("danger")
    expect(vm.tiles[0]?.tasksSearch).toBe("?mine=true")
  })

  it("lists upcoming (open, due from today, by date) and the review queue", () => {
    expect(vm.upcoming.map((t) => t.dueText)).toEqual([
      "Due 9 Oct",
      "Due 13 Oct",
      "Due 14 Oct",
    ])
    expect(vm.reviewQueue).toEqual([
      {
        id: expect.any(String),
        title: "Review me",
        pendingText: "2 requests",
        dueText: null,
      },
    ])
  })

  it("aggregates status counts and workload", () => {
    expect(vm.totalText).toBe("7 tasks")
    expect(vm.statusCounts.find((s) => s.status === "TODO")).toMatchObject({
      count: 6,
      percent: 86,
    })
    expect(vm.workload).toEqual([
      {
        id: "u1",
        name: "Ada",
        image: null,
        openCount: 2,
        text: "2 open · 1 overdue",
        percent: 100,
      },
      {
        id: "u2",
        name: "Bob",
        image: null,
        openCount: 1,
        text: "1 open",
        percent: 50,
      },
    ])
  })

  it("handles an empty workspace", () => {
    const empty = toDashboardVM([], { members: [] }, "u1", TODAY, "en")
    expect(empty.statusCounts.every((s) => s.percent === 0)).toBe(true)
    expect(empty.totalText).toBe("0 tasks")
    expect(empty.tiles.find((t) => t.key === "week")?.tone).toBe("subtle")
  })
})

describe("calendar", () => {
  it("knows the week start per locale", () => {
    expect(weekStart("en-US")).toBe(0)
    expect(weekStart("en-GB")).toBe(1)
    expect(weekStart("not a locale!")).toBe(1)
  })

  it("shifts months across years", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01")
    expect(shiftMonth("2026-01", -1)).toBe("2025-12")
  })

  it("builds a Monday-first grid with tasks by due date", () => {
    const tasks = [
      task({ title: "Late", dueDate: "2026-10-05" }),
      ...["A", "B", "C", "D"].map((t) =>
        task({ title: t, dueDate: "2026-10-20" })
      ),
      task({ title: "Shipped", status: "DONE", dueDate: "2026-10-20" }),
      task({ title: "Someday" }),
      task({ title: "Closed undated", status: "CANCELED" }),
    ]
    const vm = toCalendarVM(tasks, "2026-10", TODAY, "en-GB")
    expect(vm.monthLabel).toBe("October 2026")
    expect(vm.weekdays[0]).toEqual({ short: "Mon", long: "Monday" })
    // 1 Oct 2026 is a Thursday → the grid starts Mon 28 Sep.
    expect(vm.weeks[0]?.days[0]).toMatchObject({
      date: "2026-09-28",
      inMonth: false,
    })
    expect(vm.weeks).toHaveLength(5)
    const all = vm.weeks.flatMap((w) => w.days)
    expect(all.find((d) => d.date === TODAY)?.isToday).toBe(true)
    const late = all.find((d) => d.date === "2026-10-05")
    expect(late?.tasks[0]).toMatchObject({
      tone: "danger",
      ariaLabel: "Late · To do · Overdue",
    })
    const busy = all.find((d) => d.date === "2026-10-20")
    expect(busy?.tasks.map((t) => t.title)).toEqual(["A", "B", "C"])
    expect(busy?.moreText).toBe("+2 more")
    expect(busy?.ariaLabel).toBe("Tuesday, 20 October 2026, 5 tasks")
    expect(vm.undated.map((t) => t.title)).toEqual(["Someday"])
    expect(vm.undatedText).toBe("1 open task without a due date")
    expect(vm).toMatchObject({
      prevMonth: "2026-09",
      nextMonth: "2026-11",
      isThisMonth: true,
    })
  })

  it("starts on Sunday for en-US and falls back to this month", () => {
    const vm = toCalendarVM([], "2026-13", TODAY, "en-US")
    expect(vm.month).toBe("2026-10")
    expect(vm.weekdays[0]?.short).toBe("Sun")
    expect(vm.weeks[0]?.days[0]?.date).toBe("2026-09-27")
    expect(vm.undatedText).toBe("Every open task has a due date.")
    const nov = toCalendarVM(
      [task({ status: "DONE", dueDate: "2026-11-02" })],
      "2026-11",
      TODAY,
      "en-US"
    )
    expect(nov.isThisMonth).toBe(false)
    expect(
      nov.weeks.flatMap((w) => w.days).find((d) => d.date === "2026-11-02")
        ?.tasks[0]
    ).toMatchObject({ done: true, tone: "subtle" })
  })
})

describe("home page extras", () => {
  it("greets by the local hour", async () => {
    const { greeting } = await import("./dashboard.ts")
    expect(greeting("Ada", 3)).toBe("Good evening, Ada")
    expect(greeting("Ada", 9)).toBe("Good morning, Ada")
    expect(greeting("Ada", 14)).toBe("Good afternoon, Ada")
    expect(greeting("", 20)).toBe("Good evening")
    expect(greeting("Ada", null)).toBe("Welcome, Ada")
  })

  it("splits my open tasks into due tabs and reports progress", () => {
    const mine = [
      task({ title: "Late", assignees: [ada], dueDate: "2026-10-06" }),
      task({ title: "Now", assignees: [ada], dueDate: TODAY }),
      task({ title: "Soon B", assignees: [ada], dueDate: "2026-10-13" }),
      task({ title: "Soon A", assignees: [ada], dueDate: "2026-10-08" }),
      task({ title: "Someday", assignees: [ada] }),
      task({ title: "Far", assignees: [ada], dueDate: "2026-10-30" }),
      task({ title: "Shipped", assignees: [ada], status: "DONE" }),
      task({ title: "Bob's", assignees: [bob], dueDate: TODAY }),
    ]
    const vm = toDashboardVM(mine, members, "u1", TODAY, "en-GB", {
      firstName: "Ada",
      now: Date.parse(`${TODAY}T09:00:00`),
    })
    expect(vm.greetingText).toBe("Good morning, Ada")
    expect(vm.dateText).toBe("Wednesday 7 October")
    const tabs = Object.fromEntries(
      vm.myWork.map((t) => [t.key, t.tasks.map((x) => x.title)])
    )
    expect(tabs).toEqual({
      overdue: ["Late"],
      today: ["Now"],
      week: ["Soon A", "Soon B"],
      later: ["Far", "Someday"],
    })
    expect(vm.myWorkDefault).toBe("overdue")
    expect(vm.doneText).toBe("1 of 8 tasks done")
    expect(vm.donePercent).toBe(13)
    expect(vm.statusCounts.find((s) => s.status === "DONE")?.color).toBe(
      "green"
    )
  })

  it("defaults to the Due today tab when nothing is assigned", () => {
    const vm = toDashboardVM([], members, "u1", TODAY, "en-GB")
    expect(vm.myWorkDefault).toBe("today")
    expect(vm.greetingText).toBe("Welcome")
    expect(vm.doneText).toBe("0 of 0 tasks done")
    expect(vm.myWork.every((t) => t.count === 0 && t.emptyText)).toBe(true)
  })
})
