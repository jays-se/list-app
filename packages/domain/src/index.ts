import { clientActions, clientViews } from "./clients/clients.ts"
import { labelActions, labelViews } from "./labels/labels.ts"
import type { ActionRegistry, ViewRegistry } from "./runtime.ts"
import { sessionActions } from "./session/session.actions.ts"
import { sessionViews } from "./session/session.views.ts"
import { systemViews } from "./system/system.views.ts"
import { taskActions } from "./tasks/tasks.actions.ts"
import { collabActions } from "./tasks/tasks.collab.actions.ts"
import { historyViews } from "./tasks/tasks.history.ts"
import { taskViews } from "./tasks/tasks.views.ts"
import { workspaceViews } from "./workspace/members.views.ts"

export { validateClient } from "./clients/clients.ts"
export { validateLabel } from "./labels/labels.ts"
export * from "./runtime.ts"
export { sessionKeys } from "./session/session.queries.ts"
export {
  validateInviteCode,
  validateWorkspaceName,
} from "./session/session.validators.ts"
export { formatDateTime, formatDuration } from "./shared/format.ts"
export { type SystemInfoDto, systemKeys } from "./system/system.queries.ts"
export { toSystemInfoVM } from "./system/system.vm.ts"
export { diffTask } from "./tasks/tasks.actions.ts"
export { labelKeys, taskKeys } from "./tasks/tasks.queries.ts"
export { validateTaskDraft } from "./tasks/tasks.validators.ts"
export { workspaceKeys } from "./workspace/members.queries.ts"

/** All views, checked against `ViewMap` in @app/protocol. */
export const views = {
  ...systemViews,
  ...sessionViews,
  ...workspaceViews,
  ...taskViews,
  ...labelViews,
  ...historyViews,
  ...clientViews,
} satisfies ViewRegistry

/** All actions, checked against `ActionMap` in @app/protocol. */
export const actions = {
  ...sessionActions,
  ...taskActions,
  ...labelActions,
  ...collabActions,
  ...clientActions,
} satisfies ActionRegistry
