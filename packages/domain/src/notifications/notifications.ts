import {
  type ApiClient,
  decodeNotificationList,
  decodeNotificationSettings,
  type Notification,
  type NotificationList,
  type NotificationSettings,
} from "@app/api-client"
import type {
  InboxBadgeVM,
  InboxFilter,
  InboxKindFilterVM,
  InboxSectionVM,
  InboxVM,
  NotificationKindKey,
  NotificationSettingsVM,
  NotificationVM,
  Tone,
} from "@app/protocol"
import type { QueryOptions } from "@app/query"
import { defineAction, defineView } from "../runtime.ts"
import { daysBetween, todayISO } from "../shared/dates.ts"
import { relativeTime } from "../shared/format.ts"
import { FORMER_MEMBER } from "../tasks/tasks.collab.vm.ts"

export const notificationKeys = {
  all: ["notifications"] as const,
  lists: ["notifications", "list"] as const,
  list: (f: InboxFilter) => ["notifications", "list", f] as const,
  settings: ["notifications", "settings"] as const,
}

const asFilter = (f: string): InboxFilter => (f === "unread" ? "unread" : "all")

/** Reference cadence: the inbox polls every 20 s. */
export function inboxQuery(
  api: ApiClient,
  filter: InboxFilter
): QueryOptions<NotificationList> {
  return {
    key: notificationKeys.list(filter),
    ttl: 5_000,
    refetchInterval: 20_000,
    fetcher: async ({ signal }) =>
      decodeNotificationList(
        await api.get(
          filter === "unread" ? "/notifications?unread=true" : "/notifications",
          { signal }
        )
      ),
  }
}

export function settingsQuery(
  api: ApiClient
): QueryOptions<NotificationSettings> {
  return {
    key: notificationKeys.settings,
    ttl: 60_000,
    fetcher: async ({ signal }) =>
      decodeNotificationSettings(
        await api.get("/notifications/settings", { signal })
      ),
  }
}

export const KIND_TEXT: Record<
  NotificationKindKey,
  { label: string; setting: string; description: string }
> = {
  MENTION: {
    label: "Mention",
    setting: "Mentions",
    description: "Someone mentions you in a comment",
  },
  ASSIGNED: {
    label: "Assigned",
    setting: "Assignments",
    description: "You're assigned to a task",
  },
  STATUS: {
    label: "Status",
    setting: "Status changes",
    description: "A task you created, own or work on changes status",
  },
  DUE: {
    label: "Due soon",
    setting: "Due reminders",
    description: "A task you work on is due tomorrow",
  },
  REQUEST: {
    label: "Request",
    setting: "Change requests",
    description: "Someone asks to change a task you manage",
  },
  REVIEWED: {
    label: "Reviewed",
    setting: "Request reviews",
    description: "Your change request is approved or rejected",
  },
}

const KIND_ORDER: NotificationKindKey[] = [
  "MENTION",
  "ASSIGNED",
  "REQUEST",
  "REVIEWED",
  "STATUS",
  "DUE",
]

const KIND_TONE: Record<NotificationKindKey, Tone> = {
  MENTION: "brand",
  ASSIGNED: "informative",
  REQUEST: "warning",
  REVIEWED: "success",
  STATUS: "subtle",
  DUE: "danger",
}

const asKind = (k: string | undefined): NotificationKindKey | "" =>
  (KIND_ORDER as string[]).includes(k ?? "") ? (k as NotificationKindKey) : ""

const SECTION_LABEL: Record<InboxSectionVM["key"], string> = {
  today: "Today",
  yesterday: "Yesterday",
  week: "Earlier this week",
  older: "Older",
}

/** Newest-first notifications split by local day. */
export function toSections(
  items: { n: Notification; vm: NotificationVM }[],
  now: number
): InboxSectionVM[] {
  const today = todayISO(now)
  const sections: InboxSectionVM[] = []
  for (const { n, vm } of items) {
    const age = daysBetween(todayISO(Date.parse(n.createdAt)), today)
    const key: InboxSectionVM["key"] =
      age <= 0 ? "today" : age === 1 ? "yesterday" : age < 7 ? "week" : "older"
    const last = sections.at(-1)
    if (last?.key === key) last.items.push(vm)
    else sections.push({ key, label: SECTION_LABEL[key], items: [vm] })
  }
  return sections
}

export function toNotificationVM(
  n: Notification,
  now: number,
  locale: string
): NotificationVM {
  const actor = n.actor?.name ?? FORMER_MEMBER
  return {
    id: n.id,
    kind: n.kind,
    kindLabel: KIND_TEXT[n.kind].label,
    text: n.kind === "DUE" ? "Due tomorrow" : `${actor} ${n.detail}`,
    taskTitle: n.task?.title ?? n.taskTitle ?? "Untitled task",
    taskId: n.task?.id ?? null,
    deletedText: n.task ? null : "This task was deleted",
    quote: n.commentBody,
    timeText: relativeTime(n.createdAt, now, locale),
    unread: n.readAt === null,
    actorName: n.kind === "DUE" ? null : actor,
    actorImage: n.kind === "DUE" ? null : (n.actor?.image ?? null),
    tone: KIND_TONE[n.kind],
  }
}

export function toInboxVM(
  list: NotificationList,
  filter: InboxFilter,
  now: number,
  locale: string,
  kindParam?: string
): InboxVM {
  const kind = asKind(kindParam)
  const all = list.notifications.map((n) => ({
    n,
    vm: toNotificationVM(n, now, locale),
  }))
  const shown = kind ? all.filter((x) => x.n.kind === kind) : all
  const items = shown.map((x) => x.vm)
  const kindFilters: InboxKindFilterVM[] = [
    { value: "", label: "All", count: all.length },
    ...KIND_ORDER.map((k) => ({
      value: k,
      label: KIND_TEXT[k].setting,
      count: all.filter((x) => x.n.kind === k).length,
    })).filter((f) => f.count > 0 || f.value === kind),
  ]
  return {
    filter,
    kind,
    items,
    sections: toSections(shown, now),
    kindFilters,
    unreadCount: list.unread,
    unreadText: list.unread ? `${list.unread} unread` : "All caught up",
    isEmpty: items.length === 0,
    emptyText: kind
      ? `No ${KIND_TEXT[kind].setting.toLowerCase()} here.`
      : filter === "unread"
        ? "You're all caught up. No unread notifications."
        : "Nothing here yet. Mentions, assignments and reviews show up here.",
  }
}

export function toBadgeVM(list: NotificationList): InboxBadgeVM {
  const n = list.unread
  return {
    unreadCount: n,
    badgeText: n === 0 ? null : n > 99 ? "99+" : String(n),
    label: n ? `Inbox, ${n} unread` : "Inbox",
  }
}

export function toSettingsVM(s: NotificationSettings): NotificationSettingsVM {
  return {
    items: s.settings.map((x) => ({
      kind: x.kind,
      label: KIND_TEXT[x.kind].setting,
      description: KIND_TEXT[x.kind].description,
      enabled: x.enabled,
    })),
  }
}

export const notificationViews = {
  "inbox.list": defineView({
    queries: (params: { filter: InboxFilter; kind?: string }, ctx) => ({
      list: inboxQuery(ctx.api, asFilter(params.filter)),
    }),
    compute: ({ list }, params, ctx) =>
      toInboxVM(
        list,
        asFilter(params.filter),
        ctx.now(),
        ctx.locale,
        params.kind
      ),
  }),
  "inbox.badge": defineView({
    queries: (_p: Record<string, never>, ctx) => ({
      list: inboxQuery(ctx.api, "all"),
    }),
    compute: ({ list }) => toBadgeVM(list),
  }),
  "notifications.settings": defineView({
    queries: (_p: Record<string, never>, ctx) => ({
      settings: settingsQuery(ctx.api),
    }),
    compute: ({ settings }) => toSettingsVM(settings),
  }),
}

/** Patch every cached inbox list (both filters) in place. */
function patchLists(
  ctx: Parameters<Parameters<typeof defineAction>[0]>[1],
  fn: (l: NotificationList) => NotificationList
): () => void {
  const rollbacks = (["all", "unread"] as const).map((f) =>
    ctx.client.optimistic<NotificationList>(notificationKeys.list(f), (l) =>
      l ? fn(l) : (l as unknown as NotificationList)
    )
  )
  return () => {
    for (const r of rollbacks) r()
  }
}

export const notificationActions = {
  "notifications.read": defineAction(async (input: { id: string }, ctx) => {
    const at = new Date(ctx.now()).toISOString()
    const rollback = patchLists(ctx, (l) => {
      const hit = l.notifications.find((n) => n.id === input.id && !n.readAt)
      return {
        unread: hit ? Math.max(0, l.unread - 1) : l.unread,
        notifications: l.notifications.map((n) =>
          n.id === input.id && !n.readAt ? { ...n, readAt: at } : n
        ),
      }
    })
    try {
      await ctx.api.post(`/notifications/${encodeURIComponent(input.id)}/read`)
    } catch (error) {
      rollback()
      throw error
    }
    await ctx.client.invalidate(notificationKeys.lists)
    return null
  }),

  "notifications.readAll": defineAction(
    async (_input: Record<string, never>, ctx) => {
      const at = new Date(ctx.now()).toISOString()
      const rollback = patchLists(ctx, (l) => ({
        unread: 0,
        notifications: l.notifications.map((n) =>
          n.readAt ? n : { ...n, readAt: at }
        ),
      }))
      try {
        await ctx.api.post("/notifications/read-all")
      } catch (error) {
        rollback()
        throw error
      }
      await ctx.client.invalidate(notificationKeys.lists)
      return null
    }
  ),

  "notifications.setEnabled": defineAction(
    async (input: { kind: NotificationKindKey; enabled: boolean }, ctx) => {
      const rollback = ctx.client.optimistic<NotificationSettings>(
        notificationKeys.settings,
        (s) =>
          s
            ? {
                settings: s.settings.map((x) =>
                  x.kind === input.kind ? { ...x, enabled: input.enabled } : x
                ),
              }
            : (s as unknown as NotificationSettings)
      )
      try {
        const next = decodeNotificationSettings(
          await ctx.api.put("/notifications/settings", {
            settings: [{ kind: input.kind, enabled: input.enabled }],
          })
        )
        ctx.client.setQueryData(notificationKeys.settings, next)
      } catch (error) {
        rollback()
        throw error
      }
      return null
    }
  ),
}
