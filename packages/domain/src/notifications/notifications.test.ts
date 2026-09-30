import type { Notification, NotificationList } from "@app/api-client"
import { describe, expect, it } from "vitest"
import { toInboxVM, toNotificationVM } from "./notifications.ts"

const NOW = Date.parse("2026-10-07T15:00:00")

let seq = 0
function n(over: Partial<Notification>): Notification {
  seq++
  return {
    id: `n${seq}`,
    kind: "MENTION",
    readAt: null,
    createdAt: new Date(NOW - 60_000).toISOString(),
    actor: { id: "u2", name: "Grace", image: "g.png" },
    task: { id: "t1", title: "Launch" },
    taskTitle: "Launch",
    commentBody: null,
    detail: "mentioned you",
    ...over,
  } as Notification
}

const daysAgo = (d: number) => new Date(NOW - d * 86_400_000).toISOString()

describe("inbox view", () => {
  const list: NotificationList = {
    unread: 2,
    notifications: [
      n({}),
      n({ kind: "ASSIGNED", detail: "assigned you", createdAt: daysAgo(1) }),
      n({
        kind: "DUE",
        actor: null,
        createdAt: daysAgo(3),
        readAt: daysAgo(1),
      }),
      n({ kind: "MENTION", createdAt: daysAgo(20), readAt: daysAgo(10) }),
    ],
  }

  it("groups by day and lists the kinds present", () => {
    const vm = toInboxVM(list, "all", NOW, "en-GB")
    expect(vm.sections.map((s) => [s.label, s.items.length])).toEqual([
      ["Today", 1],
      ["Yesterday", 1],
      ["Earlier this week", 1],
      ["Older", 1],
    ])
    expect(vm.kindFilters.map((f) => [f.label, f.count])).toEqual([
      ["All", 4],
      ["Mentions", 2],
      ["Assignments", 1],
      ["Due reminders", 1],
    ])
    expect(vm.kind).toBe("")
  })

  it("filters by kind and ignores unknown kinds", () => {
    const vm = toInboxVM(list, "all", NOW, "en-GB", "MENTION")
    expect(vm.items).toHaveLength(2)
    expect(vm.kind).toBe("MENTION")
    const none = toInboxVM(
      { unread: 0, notifications: [] },
      "all",
      NOW,
      "en-GB",
      "REVIEWED"
    )
    expect(none.emptyText).toBe("No request reviews here.")
    expect(none.kindFilters.map((f) => f.value)).toEqual(["", "REVIEWED"])
    expect(toInboxVM(list, "unread", NOW, "en-GB", "bogus").kind).toBe("")
    expect(
      toInboxVM({ unread: 0, notifications: [] }, "unread", NOW, "en-GB")
        .emptyText
    ).toMatch(/all caught up/)
  })

  it("carries the actor and a tone per kind", () => {
    const vm = toNotificationVM(n({ kind: "REVIEWED" }), NOW, "en-GB")
    expect(vm).toMatchObject({
      actorName: "Grace",
      actorImage: "g.png",
      tone: "success",
    })
    const due = toNotificationVM(n({ kind: "DUE", actor: null }), NOW, "en-GB")
    expect(due).toMatchObject({ actorName: null, text: "Due tomorrow" })
    const gone = toNotificationVM(n({ actor: null }), NOW, "en-GB")
    expect(gone.actorName).toBe("A former member")
  })
})
