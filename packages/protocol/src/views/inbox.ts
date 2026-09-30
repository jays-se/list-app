/** Inbox views (E9). */
export type NotificationKindKey =
  | "MENTION"
  | "ASSIGNED"
  | "STATUS"
  | "DUE"
  | "REQUEST"
  | "REVIEWED"

export type InboxFilter = "all" | "unread"

export interface NotificationVM {
  id: string
  kind: NotificationKindKey
  kindLabel: string
  /** e.g. "Ada assigned you", "Due tomorrow". */
  text: string
  taskTitle: string
  /** null when the task was deleted: render `deletedText`, no link. */
  taskId: string | null
  deletedText: string | null
  /** Mention excerpt. */
  quote: string | null
  timeText: string
  unread: boolean
}

export interface InboxVM {
  filter: InboxFilter
  items: NotificationVM[]
  unreadCount: number
  /** e.g. "3 unread", "All caught up". */
  unreadText: string
  isEmpty: boolean
  emptyText: string
}

export interface InboxBadgeVM {
  unreadCount: number
  /** "3", "99+"; null when nothing is unread. */
  badgeText: string | null
  label: string
}

export interface NotificationSettingVM {
  kind: NotificationKindKey
  label: string
  description: string
  enabled: boolean
}

export interface NotificationSettingsVM {
  items: NotificationSettingVM[]
}
