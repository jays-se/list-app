import type { ActionRegistry, ViewRegistry } from "./runtime.ts"
import { systemViews } from "./system/system.views.ts"

export * from "./runtime.ts"
export { formatDateTime, formatDuration } from "./shared/format.ts"
export { type SystemInfoDto, systemKeys } from "./system/system.queries.ts"
export { toSystemInfoVM } from "./system/system.vm.ts"

/** All views, checked against `ViewMap` in @app/protocol. */
export const views = { ...systemViews } satisfies ViewRegistry

/** All actions, checked against `ActionMap` in @app/protocol. */
export const actions = {} satisfies ActionRegistry
