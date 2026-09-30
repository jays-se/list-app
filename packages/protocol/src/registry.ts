import type {
  InboxBadgeVM,
  InboxFilter,
  InboxVM,
  NotificationKindKey,
  NotificationSettingsVM,
} from "./views/inbox.ts"
import type { MembersVM, SessionVM, WorkspaceRefVM } from "./views/session.ts"
import type { SystemInfoVM } from "./views/system.ts"
import type {
  ClientDetailVM,
  ClientDraft,
  ClientsVM,
  LabelColorKey,
  LabelsVM,
  LabelVM,
  RequestDraft,
  RequestKind,
  RequestPayloadInput,
  TaskDetailVM,
  TaskDraft,
  TaskFormOptionsVM,
  TaskHistoryVM,
  TaskListParams,
  TaskListVM,
} from "./views/tasks.ts"

/**
 * Every view the worker can serve: `params` in, display-ready `data` out.
 * Add a view by adding an entry here and a definition in `@app/domain`.
 * These types are the only data types `apps/web` sees (ADR-0005).
 */
export interface ViewMap {
  "system.info": { params: Record<string, never>; data: SystemInfoVM }
  "session.current": { params: Record<string, never>; data: SessionVM }
  "workspace.members": { params: Record<string, never>; data: MembersVM }
  "tasks.list": { params: TaskListParams; data: TaskListVM }
  "tasks.detail": { params: { taskId: string }; data: TaskDetailVM }
  "tasks.formOptions": {
    params: Record<string, never>
    data: TaskFormOptionsVM
  }
  "labels.list": { params: Record<string, never>; data: LabelsVM }
  "tasks.history": { params: { taskId: string }; data: TaskHistoryVM }
  "clients.list": { params: Record<string, never>; data: ClientsVM }
  "clients.detail": { params: { clientId: string }; data: ClientDetailVM }
  "inbox.list": { params: { filter: InboxFilter }; data: InboxVM }
  "inbox.badge": { params: Record<string, never>; data: InboxBadgeVM }
  "notifications.settings": {
    params: Record<string, never>
    data: NotificationSettingsVM
  }
}

type NoInput = Record<string, never>

/** Every action (mutation/RPC) the worker can run: `input` in, `result` out. */
export interface ActionMap {
  "auth.logout": { input: NoInput; result: null }
  "workspaces.create": { input: { name: string }; result: WorkspaceRefVM }
  "workspaces.join": { input: { inviteCode: string }; result: WorkspaceRefVM }
  "workspaces.switch": {
    input: { workspaceId: string }
    result: WorkspaceRefVM
  }
  "workspaces.rotateInvite": { input: NoInput; result: { inviteCode: string } }
  "tasks.create": { input: TaskDraft; result: { id: string } }
  /** The worker diffs `draft` against the saved task and sends only changes. */
  "tasks.save": {
    input: { taskId: string; draft: TaskDraft }
    result: { changed: boolean; version: number }
  }
  "tasks.delete": { input: { taskId: string }; result: null }
  /** Refetch a task now (e.g. after a 409 conflict). */
  "tasks.refresh": { input: { taskId: string }; result: null }
  "labels.create": {
    input: { name: string; color: LabelColorKey }
    result: LabelVM
  }
  "labels.delete": { input: { labelId: string }; result: null }
  "tasks.addSubtask": {
    input: { parentId: string; title: string }
    result: { id: string }
  }
  "checklist.add": {
    input: { taskId: string; title: string; assigneeId: string }
    result: null
  }
  /** Optimistic: the detail view updates before the API answers. */
  "checklist.update": {
    input: {
      taskId: string
      itemId: string
      done?: boolean
      title?: string
      assigneeId?: string
    }
    result: null
  }
  "checklist.delete": {
    input: { taskId: string; itemId: string }
    result: null
  }
  /** Only mentions whose "@Name" is still in the body are sent. */
  "comments.add": {
    input: { taskId: string; body: string; mentionIds: string[] }
    result: null
  }
  /** Files are structured-cloneable; the worker reads and uploads them. */
  "attachments.upload": {
    input: { taskId: string; files: File[] }
    result: {
      uploaded: number
      failed: { filename: string; message: string }[]
    }
  }
  "attachments.delete": {
    input: { taskId: string; attachmentId: string }
    result: null
  }
  "clients.create": { input: ClientDraft; result: { id: string } }
  "clients.update": {
    input: { clientId: string; draft: ClientDraft }
    result: null
  }
  "clients.delete": { input: { clientId: string }; result: null }
  /**
   * Request mode (E5-S3): the worker diffs `draft` against the saved task
   * and files one request per changed field / assignee, all with `note`.
   */
  "requests.submit": {
    input: { taskId: string; draft: RequestDraft; note: string }
    result: { created: number }
  }
  /** One request (checklist, subtask, attachment removal). */
  "requests.propose": {
    input: {
      taskId: string
      kind: RequestKind
      payload: RequestPayloadInput
      note?: string
    }
    result: null
  }
  "requests.approve": {
    input: { taskId: string; requestId: string }
    result: null
  }
  "requests.reject": {
    input: { taskId: string; requestId: string; note: string }
    result: null
  }
  "requests.withdraw": {
    input: { taskId: string; requestId: string }
    result: null
  }
  "notifications.read": { input: { id: string }; result: null }
  "notifications.readAll": { input: NoInput; result: null }
  /** Optimistic toggle. */
  "notifications.setEnabled": {
    input: { kind: NotificationKindKey; enabled: boolean }
    result: null
  }
}

export type ViewKey = keyof ViewMap
export type ViewParams<K extends ViewKey> = ViewMap[K]["params"]
export type ViewData<K extends ViewKey> = ViewMap[K]["data"]

export type ActionKey = keyof ActionMap
export type ActionInput<K extends ActionKey> = ActionMap[K] extends {
  input: infer I
}
  ? I
  : never
export type ActionResult<K extends ActionKey> = ActionMap[K] extends {
  result: infer R
}
  ? R
  : never
