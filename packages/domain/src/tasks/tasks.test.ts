import type { MemberList, Task, TaskSummary } from "@app/api-client"
import type { TaskDraft } from "@app/protocol"
import { describe, expect, it } from "vitest"
import { validateLabel } from "../labels/labels.ts"
import {
  daysBetween,
  formatDay,
  formatRange,
  todayISO,
} from "../shared/dates.ts"
import { diffTask } from "./tasks.actions.ts"
import { normalizeFilter } from "./tasks.queries.ts"
import { validateTaskDraft } from "./tasks.validators.ts"
import {
  draftFromTask,
  dueOf,
  toTaskDetailVM,
  toTaskListVM,
} from "./tasks.vm.ts"

const TODAY = "2026-09-30"
const members: MemberList = {
  members: [
    {
      id: "u1",
      name: "Ada Lovelace",
      email: "a@x",
      image: null,
      role: "OWNER",
      joinedAt: "2026-09-01T00:00:00Z",
    },
    {
      id: "u2",
      name: "Grace Hopper",
      email: "g@x",
      image: null,
      role: "MEMBER",
      joinedAt: "2026-09-02T00:00:00Z",
    },
  ],
}
const person = (id: string, name: string) => ({ id, name, image: null })

function summary(over: Partial<TaskSummary> = {}): TaskSummary {
  return {
    id: "t1",
    title: "Ship",
    status: "TODO",
    priority: "HIGH",
    startDate: "2026-09-29",
    endDate: "2026-10-03",
    dueDate: "2026-10-02",
    assignees: [],
    labels: [],
    createdBy: person("u1", "Ada Lovelace"),
    version: 1,
    updatedAt: "2026-09-30T08:00:00Z",
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
      canManage: true,
      canManageOwners: true,
      isAssignee: false,
      canRequest: false,
    },
    ...over,
  }
}
const noClients = { clients: [] }
const NOW = Date.parse("2026-09-30T12:00:00Z")

describe("dates", () => {
  it("computes whole days across month and DST boundaries", () => {
    expect(daysBetween("2026-09-30", "2026-10-01")).toBe(1)
    expect(daysBetween("2026-03-28", "2026-03-30")).toBe(2)
    expect(daysBetween("2026-10-05", "2026-10-01")).toBe(-4)
  })

  it("formats days with the year only when it differs", () => {
    expect(formatDay("2026-10-09", TODAY, "en-GB")).toBe("9 Oct")
    expect(formatDay("2027-01-02", TODAY, "en-GB")).toBe("2 Jan 2027")
    expect(formatRange("2026-10-01", "2026-10-01", TODAY, "en-GB")).toBe(
      "1 Oct"
    )
    expect(formatRange("2026-10-01", "2026-10-10", TODAY, "en-GB")).toBe(
      "1 Oct – 10 Oct"
    )
  })

  it("reads today in a given time zone", () => {
    const lateUTC = Date.parse("2026-09-30T20:00:00Z")
    expect(todayISO(lateUTC, "UTC")).toBe("2026-09-30")
    expect(todayISO(lateUTC, "Asia/Kolkata")).toBe("2026-10-01")
  })
})

describe("dueOf", () => {
  it.each([
    [null, "TODO", null, "subtle"],
    ["2026-09-28", "TODO", "Overdue by 2 days", "danger"],
    ["2026-09-29", "IN_PROGRESS", "Overdue by 1 day", "danger"],
    ["2026-09-30", "TODO", "Due today", "warning"],
    ["2026-10-01", "TODO", "Due tomorrow", "warning"],
    ["2026-10-03", "TODO", "Due 3 Oct", "informative"],
    ["2026-11-20", "TODO", "Due 20 Nov", "subtle"],
    ["2026-09-01", "DONE", "Due 1 Sept", "subtle"],
  ] as const)("%s (%s) → %s", (due, status, text, tone) => {
    expect(dueOf(due, status, TODAY, "en-GB")).toEqual({
      dueText: text,
      dueTone: tone,
    })
  })
})

describe("toTaskListVM", () => {
  it("groups by status in workflow order and skips empty groups", () => {
    const vm = toTaskListVM(
      [
        summary({ id: "a", status: "DONE" }),
        summary({
          id: "b",
          status: "BACKLOG",
          assignees: [
            person("u1", "Ada Lovelace"),
            person("u2", "Grace Hopper"),
            person("u3", "Alan Turing"),
          ],
        }),
        summary({ id: "c", status: "BACKLOG" }),
      ],
      normalizeFilter({}),
      members,
      [],
      noClients,
      TODAY,
      "en-GB"
    )
    expect(vm.groups.map((g) => [g.status, g.label, g.countText])).toEqual([
      ["BACKLOG", "Backlog", "2"],
      ["DONE", "Done", "1"],
    ])
    expect(vm.groups[0]?.tasks[0]?.assigneesText).toBe("Ada, Grace +1")
    expect(vm.groups[0]?.tasks[1]?.assigneesText).toBe("Unassigned")
    expect(vm.totalText).toBe("3 tasks")
    expect(vm.filters.activeCount).toBe(0)
    expect(vm.filters.assigneeOptions.map((o) => o.label)).toEqual([
      "Anyone",
      "Ada Lovelace",
      "Grace Hopper",
    ])
  })

  it("explains an empty result differently with filters", () => {
    const none = toTaskListVM(
      [],
      normalizeFilter({}),
      members,
      [],
      noClients,
      TODAY,
      "en"
    )
    const filtered = toTaskListVM(
      [],
      normalizeFilter({ status: "DONE", mine: "true" }),
      members,
      [],
      noClients,
      TODAY,
      "en"
    )
    expect(none.emptyTitle).toBe("No tasks yet")
    expect(filtered.emptyTitle).toBe("No matching tasks")
    expect(filtered.filters.activeCount).toBe(2)
  })

  it("builds the view model for 2,000 tasks quickly (E4-S2 perf budget)", () => {
    const statuses = [
      "BACKLOG",
      "TODO",
      "IN_PROGRESS",
      "TESTING",
      "DONE",
      "CANCELED",
    ] as const
    const tasks = Array.from({ length: 2000 }, (_, i) =>
      summary({
        id: `t${i}`,
        status: statuses[i % 6] as (typeof statuses)[number],
        dueDate:
          i % 5 ? `2026-10-${String((i % 28) + 1).padStart(2, "0")}` : null,
        assignees: [person("u1", "Ada Lovelace")],
      })
    )
    const start = performance.now()
    const vm = toTaskListVM(
      tasks,
      normalizeFilter({}),
      members,
      [],
      noClients,
      TODAY,
      "en-GB"
    )
    const ms = performance.now() - start
    expect(vm.groups).toHaveLength(6)
    expect(ms).toBeLessThan(100)
  })
})

describe("normalizeFilter", () => {
  it("drops invalid values and lets mine override assignee", () => {
    expect(
      normalizeFilter({
        status: "NOPE",
        mine: "true",
        assigneeId: "u2",
        labelId: "l1",
      })
    ).toEqual({
      status: "",
      mine: true,
      assigneeId: "",
      labelId: "l1",
      clientId: "",
    })
  })
})

const task: Task = {
  id: "t1",
  title: "Ship",
  description: null,
  status: "TODO",
  priority: "NONE",
  startDate: "2026-10-01",
  endDate: "2026-10-02",
  dueDate: null,
  assignees: [person("u2", "Grace Hopper")],
  owners: [],
  labels: [],
  createdBy: person("u1", "Ada Lovelace"),
  createdAt: "2026-09-30T10:00:00Z",
  updatedAt: "2026-09-30T10:00:00Z",
  version: 3,
  viewer: {
    canManage: true,
    canManageOwners: true,
    isAssignee: false,
    canRequest: false,
  },
  client: null,
  parent: null,
  subtasks: [],
  checklist: [],
  comments: [],
  attachments: [],
  requests: [],
}

describe("detail and diff", () => {
  it("builds a detail view model with mode and owner candidates", () => {
    const vm = toTaskDetailVM(
      task,
      members,
      [],
      noClients,
      TODAY,
      NOW,
      "en-GB",
      "u1"
    )
    expect(vm.mode).toBe("manage")
    expect(vm.ownerCandidates.map((p) => p.id)).toEqual(["u2"])
    expect(vm.createdText).toBe("Created by Ada Lovelace on 30 Sept 2026")
    expect(
      toTaskDetailVM(
        { ...task, viewer: { ...task.viewer, canManage: false } },
        members,
        [],
        noClients,
        TODAY,
        NOW,
        "en",
        "u1"
      ).mode
    ).toBe("view")
  })

  it("diffs only changed scalar fields, normalizing blanks to null", () => {
    const saved = draftFromTask(task)
    expect(diffTask(saved, saved)).toEqual({})
    const draft: TaskDraft = {
      ...saved,
      title: " Ship it ",
      description: "  ",
      dueDate: "2026-10-02",
      assigneeIds: [],
    }
    expect(diffTask(saved, draft)).toEqual({
      title: "Ship it",
      dueDate: "2026-10-02",
    })
    expect(
      diffTask({ ...saved, dueDate: "2026-10-02" }, { ...saved, dueDate: "" })
    ).toEqual({ dueDate: null })
  })
})

describe("validators", () => {
  const ok: TaskDraft = { ...draftFromTask(task) }
  it("accepts a valid draft", () => expect(validateTaskDraft(ok)).toEqual([]))
  it("mirrors the API messages", () => {
    expect(
      validateTaskDraft({ ...ok, title: " ", startDate: "", endDate: "" })
    ).toEqual([
      { field: "title", message: "Title is required" },
      { field: "startDate", message: "Start and end date are required" },
      { field: "endDate", message: "Start and end date are required" },
    ])
    expect(validateTaskDraft({ ...ok, endDate: "2026-09-01" })).toEqual([
      { field: "endDate", message: "End date must be on or after start date" },
    ])
  })
  it("validates labels", () => {
    expect(validateLabel(" ", "neon").map((e) => e.field)).toEqual([
      "name",
      "color",
    ])
    expect(validateLabel("Bug", "red")).toEqual([])
  })
})
