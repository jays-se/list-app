export type QueryKey = readonly unknown[]

export type QueryStatus = "idle" | "loading" | "success" | "error"

export interface QuerySnapshot<T> {
  status: QueryStatus
  data?: T
  error?: unknown
  isFetching: boolean
  /** Epoch ms of the last successful fetch or setQueryData; 0 when none. */
  updatedAt: number
}

export interface FetchContext {
  signal: AbortSignal
}

export interface QueryOptions<T> {
  key: QueryKey
  fetcher?: (ctx: FetchContext) => Promise<T>
  /** How long data stays fresh (ms). Default from the client (0 = always stale). */
  ttl?: number
  /** How long an unobserved query is kept (ms). `Infinity` keeps it forever. */
  gcTime?: number
  /** Poll while observed and the tab is visible (ms). 0/undefined disables. */
  refetchInterval?: number
  /** Retries after the first failure. Non-retryable errors never retry. */
  retry?: number
}

export interface QueryClientConfig {
  ttl?: number
  gcTime?: number
  retry?: number
  /** Delay before retry `attempt` (0-based). Default: 1s, 2s, 4s … capped at 30s. */
  retryDelay?: (attempt: number) => number
  /** Default: never retry aborts or 4xx (`error.status` in 400–499). */
  isRetryable?: (error: unknown) => boolean
  now?: () => number
}

export type Updater<T> = T | ((previous: T | undefined) => T)

export interface MutationOptions<V, R, C = unknown> {
  mutationFn: (variables: V, ctx: FetchContext) => Promise<R>
  /** Runs first; return a context (e.g. a rollback fn) passed to later hooks. */
  onMutate?: (variables: V) => C | Promise<C>
  onSuccess?: (result: R, variables: V, context: C | undefined) => unknown
  onError?: (error: unknown, variables: V, context: C | undefined) => unknown
  /** Query-key prefixes to invalidate (and refetch if observed) on success. */
  invalidates?:
    | readonly QueryKey[]
    | ((result: R, variables: V) => readonly QueryKey[])
  signal?: AbortSignal
}
