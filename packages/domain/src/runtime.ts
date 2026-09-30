import type { ApiClient } from "@app/api-client"
import type {
  ActionInput,
  ActionKey,
  ActionResult,
  UploadProgress,
  ViewData,
  ViewKey,
  ViewParams,
} from "@app/protocol"
import type { QueryClient, QueryOptions } from "@app/query"

/** Everything a view or action may use. Injected by the worker kernel. */
export interface DomainContext {
  api: ApiClient
  client: QueryClient
  now: () => number
  locale: string
  /**
   * Drop all cached data and refetch every live view (ADR-0019). Call after
   * anything that changes the tenant: workspace create/join/switch, logout.
   * Never call `client.clearAll()` directly — it would orphan live views.
   */
  resetData: () => void
  /**
   * PUTs a file to a presigned target, reporting progress 0–100. The worker
   * implements it with XHR (fetch has no upload progress); tests fake it.
   */
  upload: (
    target: { method: string; url: string; headers: Record<string, string> },
    file: Blob,
    onProgress: (percent: number) => void
  ) => Promise<void>
  /** Pushes an upload progress event to the main thread. */
  notify: (progress: UploadProgress) => void
}

/**
 * A view: which queries it needs for given params, and how to turn their
 * data into a display-ready view model. `compute` must be pure.
 * (Method syntax keeps definitions assignable to the kernel's erased type.)
 */
export interface ViewDefinition<P, D> {
  queries(params: P, ctx: DomainContext): Record<string, QueryOptions<unknown>>
  compute(data: Record<string, unknown>, params: P, ctx: DomainContext): D
}

export interface ActionDefinition<I, R> {
  run(input: I, ctx: DomainContext): Promise<R>
}

type DataOf<Q> = {
  [K in keyof Q]: Q[K] extends QueryOptions<infer T> ? T : never
}

/** Typed helper: `compute` receives each query's data under its name. */
export function defineView<
  P,
  D,
  Q extends Record<string, QueryOptions<unknown>>,
>(definition: {
  queries: (params: P, ctx: DomainContext) => Q
  compute: (data: DataOf<Q>, params: P, ctx: DomainContext) => D
}): ViewDefinition<P, D> {
  return {
    queries: (params, ctx) => definition.queries(params, ctx),
    compute: (data, params, ctx) =>
      definition.compute(data as DataOf<Q>, params, ctx),
  }
}

export function defineAction<I, R>(
  run: (input: I, ctx: DomainContext) => Promise<R>
): ActionDefinition<I, R> {
  return { run }
}

/** Compile-time check that every ViewMap/ActionMap entry is implemented. */
export type ViewRegistry = {
  [K in ViewKey]: ViewDefinition<ViewParams<K>, ViewData<K>>
}
export type ActionRegistry = {
  [K in ActionKey]: ActionDefinition<ActionInput<K>, ActionResult<K>>
}
