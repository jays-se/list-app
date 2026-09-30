import type { TaskEvent, TaskHistory } from "@app/api-client"
import { describe, expect, it } from "vitest"
import { validateClient } from "../clients/clients.ts"
import { formatBytes, relativeTime } from "../shared/format.ts"
import { segments } from "./tasks.collab.vm.ts"
import { eventText, stageDurations, toHistoryVM } from "./tasks.history.ts"

const TODAY = "2026-09-30"
const ev = (over: Partial<TaskEvent>): TaskEvent => ({
  id: "e",
  kind: "CREATED",
  field: null,
  from: null,
  to: null,
  subject: null,
  actor: null,
  createdAt: "2026-09-30T10:00:00Z",
  ...over,
})

describe("comment segments", () => {
  it("highlights mentions, longest name first", () => {
    expect(
      segments("Hi @Ada Lovelace and @Ada!", ["Ada", "Ada Lovelace"])
    ).toEqual([
      { text: "Hi ", mention: false },
      { text: "@Ada Lovelace", mention: true },
      { text: " and ", mention: false },
      { text: "@Ada", mention: true },
      { text: "!", mention: false },
    ])
    expect(segments("no mentions", [])).toEqual([
      { text: "no mentions", mention: false },
    ])
  })
})

describe("history text", () => {
  it.each([
    [ev({ kind: "CREATED" }), "created this task"],
    [
      ev({ kind: "STATUS", from: "TODO", to: "IN_PROGRESS" }),
      "changed status from To do to In progress",
    ],
    [
      ev({ kind: "UPDATED", field: "title", to: "Ship v2" }),
      "renamed the task to “Ship v2”",
    ],
    [
      ev({ kind: "UPDATED", field: "priority", from: "LOW", to: "URGENT" }),
      "changed priority from Low to Urgent",
    ],
    [
      ev({ kind: "UPDATED", field: "dueDate", from: null, to: "2026-10-03" }),
      "set the due date to 3 Oct",
    ],
    [
      ev({ kind: "UPDATED", field: "dueDate", from: "2026-10-03", to: null }),
      "cleared the due date",
    ],
    [
      ev({ kind: "UPDATED", field: "client", from: null, to: "Globex" }),
      "linked client Globex",
    ],
    [ev({ kind: "ASSIGNEE_ADDED", subject: "Grace" }), "assigned Grace"],
    [
      ev({ kind: "CHECKLIST_ASSIGNED", subject: "Draft", to: "Grace" }),
      "assigned “Draft” to Grace",
    ],
    [
      ev({ kind: "CHECKLIST_RENAMED", from: "A", to: "B" }),
      "renamed checklist item “A” to “B”",
    ],
    [
      ev({ kind: "ATTACHMENT_ADDED", subject: "notes.txt" }),
      "attached notes.txt",
    ],
  ])("%#", (e, text) => {
    expect(eventText(e, TODAY, "en-GB")).toBe(text)
  })

  it("names former members and sums time per status", () => {
    const h: TaskHistory = {
      events: [
        ev({ actor: null }),
        ev({ id: "e2", actor: { id: "u", name: "Ada", image: null } }),
      ],
      stages: [
        {
          status: "TODO",
          enteredAt: "2026-09-30T00:00:00Z",
          leftAt: "2026-09-30T02:00:00Z",
        },
        {
          status: "IN_PROGRESS",
          enteredAt: "2026-09-30T02:00:00Z",
          leftAt: "2026-09-30T03:00:00Z",
        },
        { status: "TODO", enteredAt: "2026-09-30T03:00:00Z", leftAt: null },
      ],
    }
    const now = Date.parse("2026-09-30T04:30:00Z")
    const vm = toHistoryVM(h, now, TODAY, "en-GB")
    expect(vm.items.map((i) => i.actorName)).toEqual(["A former member", "Ada"])
    expect(stageDurations(h, now)).toEqual([
      {
        status: "TODO",
        label: "To do",
        durationText: "3h 30m",
        isCurrent: true,
      },
      {
        status: "IN_PROGRESS",
        label: "In progress",
        durationText: "1h",
        isCurrent: false,
      },
    ])
  })
})

describe("formatting", () => {
  it.each([
    [512, "512 B"],
    [3482, "3.4 KB"],
    [5 * 1024 * 1024, "5.0 MB"],
    [42 * 1024 * 1024, "42 MB"],
  ])("formatBytes(%d) = %s", (n, text) => expect(formatBytes(n)).toBe(text))

  it("relative time", () => {
    const now = Date.parse("2026-09-30T12:00:00Z")
    expect(relativeTime("2026-09-30T11:59:40Z", now, "en")).toBe("just now")
    expect(relativeTime("2026-09-30T11:55:00Z", now, "en")).toBe("5 min ago")
    expect(relativeTime("2026-09-30T09:00:00Z", now, "en")).toBe("3 h ago")
    expect(relativeTime("2026-09-29T09:00:00Z", now, "en")).toBe("yesterday")
  })
})

describe("validateClient", () => {
  it("mirrors the API", () => {
    const ok = {
      name: "Globex",
      email: "",
      phone: "",
      color: "teal" as const,
      notes: "",
    }
    expect(validateClient(ok)).toEqual([])
    expect(
      validateClient({
        ...ok,
        name: " ",
        email: "nope",
        color: "neon" as never,
      }).map((e) => e.field)
    ).toEqual(["name", "email", "color"])
  })
})

describe("row activity text", () => {
  it("pluralizes in the worker", async () => {
    const { toTaskRowVM } = await import("./tasks.vm.ts")
    const base = {
      id: "t",
      title: "T",
      status: "TODO" as const,
      priority: "NONE" as const,
      startDate: TODAY,
      endDate: TODAY,
      dueDate: null,
      assignees: [],
      labels: [],
      createdBy: { id: "u", name: "U", image: null },
      version: 1,
      updatedAt: "2026-09-30T00:00:00Z",
      client: null,
      parent: null,
    }
    const counts = (comments: number, attachments: number) => ({
      subtasks: 0,
      subtasksDone: 0,
      checklist: 0,
      checklistDone: 0,
      comments,
      attachments,
    })
    expect(
      toTaskRowVM({ ...base, counts: counts(1, 1) }, TODAY, "en").activityText
    ).toBe("1 comment · 1 file")
    expect(
      toTaskRowVM({ ...base, counts: counts(2, 0) }, TODAY, "en").activityText
    ).toBe("2 comments")
    expect(
      toTaskRowVM({ ...base, counts: counts(0, 0) }, TODAY, "en").activityText
    ).toBeNull()
  })
})
