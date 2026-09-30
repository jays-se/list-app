import type { SystemInfoVM } from "./views/system.ts"

/**
 * Every view the worker can serve: `params` in, display-ready `data` out.
 * Add a view by adding an entry here and a definition in `@app/domain`.
 * These types are the only data types `apps/web` sees (ADR-0005).
 */
export interface ViewMap {
  "system.info": { params: Record<string, never>; data: SystemInfoVM }
}

/** Every action (mutation/RPC) the worker can run: `input` in, `result` out. */
// biome-ignore lint/complexity/noBannedTypes: entries arrive with the first mutation (E3/E4).
export type ActionMap = {}

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
