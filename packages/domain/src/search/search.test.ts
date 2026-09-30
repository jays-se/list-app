import type { ClientList, DocSummary, TaskSummary } from "@app/api-client"
import { describe, expect, it } from "vitest"
import { score, toSearchVM } from "./search.ts"

const TODAY = "2026-10-07"

function task(id: string, title: string, over: Partial<TaskSummary> = {}) {
  return {
    id,
    title,
    status: "IN_PROGRESS",
    priority: "NONE",
    startDate: TODAY,
    endDate: TODAY,
    dueDate: null,
    assignees: [],
    labels: [],
    createdBy: null,
    version: 1,
    updatedAt: `${TODAY}T00:00:00Z`,
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
  } as TaskSummary
}

const doc = (id: string, title: string, excerpt = ""): DocSummary => ({
  id,
  title,
  excerpt,
  client: null,
  createdBy: null,
  updatedBy: null,
  updatedAt: `${TODAY}T00:00:00Z`,
  version: 1,
  fileCount: 0,
})

const clients: ClientList = {
  clients: [
    {
      id: "c1",
      name: "Acme Corp",
      email: "ops@acme.test",
      phone: null,
      color: "teal",
      notes: null,
      taskCount: 2,
      docCount: 1,
    },
  ],
}

describe("score", () => {
  it("prefers exact, then prefix, then word start, then anywhere", () => {
    expect(score("Launch", "launch")).toBe(0)
    expect(score("Launch plan", "laun")).toBe(1)
    expect(score("Plan the launch", "laun")).toBe(2)
    expect(score("Relaunch", "launch")).toBe(3)
    expect(score("Deck", "acme", "Acme Corp")).toBe(4)
    expect(score("Deck", "zzz")).toBeNull()
    expect(score("Deck", "   ")).toBeNull()
  })

  it("needs every word, in any order", () => {
    expect(score("Send the vendor deck", "deck vendor")).not.toBeNull()
    expect(score("Send the vendor deck", "deck invoice")).toBeNull()
  })
})

describe("global search view", () => {
  const tasks = [
    task("t1", "Relaunch website"),
    task("t2", "Launch plan", {
      dueDate: "2026-10-05",
      client: { id: "c1", name: "Acme Corp", color: "teal" },
    }),
    task("t3", "Unrelated"),
    ...Array.from({ length: 7 }, (_, i) => task(`x${i}`, `Launch task ${i}`)),
  ]
  const docs = [doc("d1", "Launch notes"), doc("d2", "", "launch checklist")]

  it("suggests pages when the query is empty", () => {
    const vm = toSearchVM("  ", tasks, docs, clients, TODAY, "en-GB")
    expect(vm.groups.map((g) => g.key)).toEqual(["pages"])
    expect(vm.groups[0]?.items[0]).toMatchObject({ title: "Home", to: "/" })
    expect(vm.isEmpty).toBe(false)
  })

  it("ranks and groups tasks, docs, clients and pages", () => {
    const vm = toSearchVM("launch", tasks, docs, clients, TODAY, "en-GB")
    const taskGroup = vm.groups.find((g) => g.key === "tasks")
    expect(taskGroup?.items[0]).toMatchObject({
      title: "Launch plan",
      taskId: "t2",
      to: null,
      subtitle: "In progress · Acme Corp · Overdue by 2 days",
      color: "purple",
      tone: "danger",
    })
    expect(taskGroup?.items.at(-1)?.title).not.toBe("Relaunch website")
    expect(taskGroup?.items).toHaveLength(6)
    expect(taskGroup?.countText).toBe("6 of 9")
    const docGroup = vm.groups.find((g) => g.key === "docs")
    expect(docGroup?.items.map((d) => d.title)).toEqual([
      "Launch notes",
      "Untitled doc",
    ])
    expect(docGroup?.items[0]?.to).toBe("/docs/d1")
    expect(vm.total).toBe(8)
  })

  it("finds clients by name or email, pages by keyword, and says when nothing matches", () => {
    const byEmail = toSearchVM("ops@acme", [], [], clients, TODAY, "en-GB")
    expect(byEmail.groups[0]?.items[0]).toMatchObject({
      kind: "client",
      to: "/clients/c1",
      subtitle: "ops@acme.test",
      color: "teal",
    })
    const page = toSearchVM("new", [], [], clients, TODAY, "en-GB")
    expect(page.groups[0]?.items[0]).toMatchObject({
      title: "Create task",
      to: "?create=1",
    })
    const none = toSearchVM("qqq", tasks, docs, clients, TODAY, "en-GB")
    expect(none.isEmpty).toBe(true)
    expect(none.emptyText).toBe("Nothing matches “qqq”.")
  })
})
