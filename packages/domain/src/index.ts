import type { ActionRegistry, ViewRegistry } from "./runtime.ts"
import { sessionActions } from "./session/session.actions.ts"
import { sessionViews } from "./session/session.views.ts"
import { systemViews } from "./system/system.views.ts"
import { workspaceViews } from "./workspace/members.views.ts"

export * from "./runtime.ts"
export { sessionKeys } from "./session/session.queries.ts"
export {
  validateInviteCode,
  validateWorkspaceName,
} from "./session/session.validators.ts"
export { formatDateTime, formatDuration } from "./shared/format.ts"
export { type SystemInfoDto, systemKeys } from "./system/system.queries.ts"
export { toSystemInfoVM } from "./system/system.vm.ts"
export { workspaceKeys } from "./workspace/members.queries.ts"

/** All views, checked against `ViewMap` in @app/protocol. */
export const views = {
  ...systemViews,
  ...sessionViews,
  ...workspaceViews,
} satisfies ViewRegistry

/** All actions, checked against `ActionMap` in @app/protocol. */
export const actions = { ...sessionActions } satisfies ActionRegistry
