import type {
  InboxBadgeVM,
  InboxVM,
  NotificationSettingsVM,
  TaskDetailVM,
} from "@app/protocol"
import { describe, expect, it } from "vitest"
import { setup } from "./requests-inbox.fixture.ts"

describe("change requests through the kernel", () => {
  it("files one request per changed field and assignee, with the note", async () => {
    const t = await setup()
    await t.subscribe("d", "tasks.detail", { taskId: "t1" })
    const vm = t.data<TaskDetailVM>("d")
    expect(vm?.mode).toBe("request")
    expect(vm?.requestDraft).toEqual({
      status: "TODO",
      startDate: "2026-10-01",
      endDate: "2026-10-05",
      dueDate: "",
      assigneeIds: ["u1"],
    })
    const draft = vm?.requestDraft
    expect(
      await t.run("requests.submit", { taskId: "t1", draft, note: "" })
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", message: "Change something to request it." },
    })
    expect(
      await t.run("requests.submit", {
        taskId: "t1",
        draft: { ...draft, endDate: "2026-09-01" },
        note: "",
      })
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: [{ field: "endDate" }] },
    })
    expect(
      await t.run("requests.submit", {
        taskId: "t1",
        draft: { ...draft, startDate: "" },
        note: "",
      })
    ).toMatchObject({
      ok: false,
      error: { fieldErrors: [{ field: "startDate" }] },
    })
    expect(
      await t.run("requests.submit", {
        taskId: "t1",
        draft: { ...draft, status: "DONE" },
        note: "x".repeat(1001),
      })
    ).toMatchObject({ ok: false, error: { fieldErrors: [{ field: "note" }] } })

    const reply = await t.run("requests.submit", {
      taskId: "t1",
      draft: {
        ...draft,
        status: "IN_PROGRESS",
        dueDate: "2026-10-03",
        assigneeIds: ["u3"],
      },
      note: " Please ",
    })
    expect(reply).toMatchObject({ ok: true, data: { created: 4 } })
    const posted = t.api.calls
      .filter((c) => c.path === "/tasks/t1/requests")
      .map((c) => c.body)
    expect(posted).toEqual([
      {
        kind: "UPDATE",
        payload: { field: "status", value: "IN_PROGRESS" },
        note: "Please",
      },
      {
        kind: "UPDATE",
        payload: { field: "dueDate", value: "2026-10-03" },
        note: "Please",
      },
      { kind: "ASSIGNEE_ADD", payload: { userId: "u3" }, note: "Please" },
      { kind: "ASSIGNEE_REMOVE", payload: { userId: "u1" }, note: "Please" },
    ])
    await t.settle()
    const after = t.data<TaskDetailVM>("d")
    expect(after?.pendingFields).toEqual({
      status: "Awaiting approval: In progress",
      dueDate: "Awaiting approval: 3 Oct",
    })
    expect(after?.pendingAssigneesText).toBe(
      "Awaiting approval: ASSIGNEE_REMOVE u1, ASSIGNEE_ADD u3"
    )
    expect(after?.requestsText).toBe("4 awaiting review")
    expect(after?.requests[0]).toMatchObject({
      canWithdraw: true,
      canReview: false,
      statusLabel: "Awaiting review",
    })
  })

  it("proposes single requests, withdraws, and shows review outcomes", async () => {
    const t = await setup()
    await t.subscribe("d", "tasks.detail", { taskId: "t1" })
    expect(
      await t.run("requests.propose", {
        taskId: "t1",
        kind: "CHECKLIST_UPDATE",
        payload: { itemId: "c1", done: true },
      })
    ).toMatchObject({ ok: true })
    await t.run("requests.propose", {
      taskId: "t1",
      kind: "SUBTASK_ADD",
      payload: { title: "Docs" },
      note: "n",
    })
    await t.settle()
    let vm = t.data<TaskDetailVM>("d")
    expect(vm?.checklist[0]?.pendingText).toBe(
      "Awaiting approval: CHECKLIST_UPDATE c1"
    )
    expect(vm?.canRequestSubtask).toBe(true)

    await t.run("requests.withdraw", { taskId: "t1", requestId: "r1" })
    await t.run("requests.reject", {
      taskId: "t1",
      requestId: "r2",
      note: "Not now",
    })
    await t.settle()
    vm = t.data<TaskDetailVM>("d")
    expect(vm?.requestsText).toBe("2 past requests")
    expect(vm?.requests.map((r) => r.reviewText)).toEqual([
      "Rejected by Grace · Not now",
      "Withdrawn by the requester",
    ])
    expect(
      await t.run("requests.reject", {
        taskId: "t1",
        requestId: "r2",
        note: "y".repeat(1001),
      })
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } })

    // A manager sees Approve / Reject.
    t.api.task.viewer = {
      canManage: true,
      canManageOwners: true,
      isAssignee: true,
      canRequest: false,
    }
    await t.run("requests.propose", {
      taskId: "t1",
      kind: "CHECKLIST_ADD",
      payload: { title: "More" },
    })
    await t.settle()
    vm = t.data<TaskDetailVM>("d")
    expect(vm?.mode).toBe("manage")
    expect(vm?.requests[0]).toMatchObject({ canReview: true })
    await t.run("requests.approve", { taskId: "t1", requestId: "r3" })
    await t.settle()
    expect(t.data<TaskDetailVM>("d")?.requests[0]?.reviewText).toBe(
      "Approved by Grace"
    )
  })

  it("reports a failure midway and keeps the ones already filed", async () => {
    const t = await setup()
    await t.subscribe("d", "tasks.detail", { taskId: "t1" })
    const draft = t.data<TaskDetailVM>("d")?.requestDraft
    await t.run("requests.propose", {
      taskId: "t1",
      kind: "UPDATE",
      payload: { field: "status", value: "DONE" },
    })
    t.api.failOnce()
    expect(
      await t.run("requests.submit", {
        taskId: "t1",
        draft: { ...draft, status: "DONE" },
        note: "",
      })
    ).toMatchObject({ ok: false, error: { code: "HTTP_500" } })
  })
})

describe("inbox through the kernel", () => {
  it("renders the inbox and badge, marks read (optimistic) and read-all", async () => {
    const t = await setup()
    await t.subscribe("all", "inbox.list", { filter: "all" })
    await t.subscribe("badge", "inbox.badge", {})
    await t.subscribe("unread", "inbox.list", { filter: "unread" })
    const vm = t.data<InboxVM>("all")
    expect(vm).toMatchObject({
      unreadCount: 2,
      unreadText: "2 unread",
      isEmpty: false,
    })
    expect(vm?.items[0]).toMatchObject({
      text: "Grace assigned you",
      taskId: "t1",
      unread: true,
      kindLabel: "Assigned",
    })
    expect(vm?.items[1]).toMatchObject({
      text: "Due tomorrow",
      taskId: null,
      deletedText: "This task was deleted",
      taskTitle: "Renew",
    })
    expect(t.data<InboxBadgeVM>("badge")).toEqual({
      unreadCount: 2,
      badgeText: "2",
      label: "Inbox, 2 unread",
    })
    expect(t.data<InboxVM>("unread")?.items).toHaveLength(2)

    t.api.failOnce()
    expect(await t.run("notifications.read", { id: "n1" })).toMatchObject({
      ok: false,
    })
    expect(t.data<InboxVM>("all")?.unreadCount).toBe(2) // rolled back
    expect(await t.run("notifications.read", { id: "n1" })).toMatchObject({
      ok: true,
    })
    await t.settle()
    expect(t.data<InboxBadgeVM>("badge")?.badgeText).toBe("1")

    t.api.failOnce()
    expect(await t.run("notifications.readAll", {})).toMatchObject({
      ok: false,
    })
    expect(await t.run("notifications.readAll", {})).toMatchObject({ ok: true })
    await t.settle()
    expect(t.data<InboxVM>("all")).toMatchObject({
      unreadCount: 0,
      unreadText: "All caught up",
    })
    expect(t.data<InboxBadgeVM>("badge")).toMatchObject({
      badgeText: null,
      label: "Inbox",
    })
    expect(t.data<InboxVM>("unread")).toMatchObject({
      isEmpty: true,
      emptyText: "You're all caught up. No unread notifications.",
    })
  })

  it("toggles settings optimistically and rolls back on failure", async () => {
    const t = await setup()
    await t.subscribe("s", "notifications.settings", {})
    expect(t.data<NotificationSettingsVM>("s")?.items[0]).toMatchObject({
      kind: "MENTION",
      label: "Mentions",
      enabled: true,
    })
    t.api.failOnce()
    expect(
      await t.run("notifications.setEnabled", {
        kind: "MENTION",
        enabled: false,
      })
    ).toMatchObject({ ok: false })
    expect(t.data<NotificationSettingsVM>("s")?.items[0]?.enabled).toBe(true)
    expect(
      await t.run("notifications.setEnabled", {
        kind: "MENTION",
        enabled: false,
      })
    ).toMatchObject({ ok: true })
    await t.settle()
    expect(t.data<NotificationSettingsVM>("s")?.items[0]?.enabled).toBe(false)
  })
})
