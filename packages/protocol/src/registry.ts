import type { MembersVM, SessionVM, WorkspaceRefVM } from "./views/session.ts"
import type { SystemInfoVM } from "./views/system.ts"

/**
 * Every view the worker can serve: `params` in, display-ready `data` out.
 * Add a view by adding an entry here and a definition in `@app/domain`.
 * These types are the only data types `apps/web` sees (ADR-0005).
 */
export interface ViewMap {
  "system.info": { params: Record<string, never>; data: SystemInfoVM }
  "session.current": { params: Record<string, never>; data: SessionVM }
  "workspace.members": { params: Record<string, never>; data: MembersVM }
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
