import { hashKey, matchKey } from "./key.ts"
import { Query, type QueryEnv } from "./query.ts"
import { defaultIsRetryable, defaultRetryDelay } from "./retry.ts"
import type {
  MutationOptions,
  QueryClientConfig,
  QueryKey,
  QueryOptions,
  QuerySnapshot,
  Updater,
} from "./types.ts"

const noop = () => {}

/**
 * In-house query engine (ADR-0006). Framework-free; runs inside the worker.
 * Owns every `Query` by key hash and exposes fetch/observe/invalidate plus
 * mutations with optimistic updates.
 */
export class QueryClient {
  private readonly queries = new Map<string, Query<unknown>>()
  private readonly env: QueryEnv
  private visible = true

  constructor(config: QueryClientConfig = {}) {
    this.env = {
      now: config.now ?? Date.now,
      isVisible: () => this.visible,
      isRetryable: config.isRetryable ?? defaultIsRetryable,
      retryDelay: config.retryDelay ?? defaultRetryDelay,
      defaults: {
        ttl: config.ttl ?? 0,
        gcTime: config.gcTime ?? 5 * 60_000,
        retry: config.retry ?? 2,
      },
      onGc: (query) => {
        if (this.queries.get(query.hash) !== query) return
        query.destroy()
        this.queries.delete(query.hash)
      },
    }
  }

  /** Returns the query for `options.key`, creating it or refreshing its options. */
  query<T>(options: QueryOptions<T>): Query<T> {
    const hash = hashKey(options.key)
    const existing = this.queries.get(hash) as Query<T> | undefined
    if (existing) {
      existing.options = { ...existing.options, ...options }
      return existing
    }
    const query = new Query<T>(options.key, hash, options, this.env)
    this.queries.set(hash, query as Query<unknown>)
    return query
  }

  /** Subscribes to a query; fetches when stale and polls while observed. */
  observe<T>(
    options: QueryOptions<T>,
    listener: (snapshot: QuerySnapshot<T>) => void
  ): () => void {
    return this.query(options).subscribe(listener)
  }

  /** One-off read: cached data when fresh, otherwise a (deduplicated) fetch. */
  fetchQuery<T>(options: QueryOptions<T>): Promise<T> {
    const query = this.query(options)
    if (!query.isStale()) return Promise.resolve(query.snapshot.data as T)
    return query.fetch()
  }

  prefetch<T>(options: QueryOptions<T>): Promise<void> {
    return this.fetchQuery(options).then(noop, noop)
  }

  getQueryData<T>(key: QueryKey): T | undefined {
    return this.queries.get(hashKey(key))?.snapshot.data as T | undefined
  }

  getSnapshot<T>(key: QueryKey): QuerySnapshot<T> | undefined {
    return this.queries.get(hashKey(key))?.snapshot as
      | QuerySnapshot<T>
      | undefined
  }

  setQueryData<T>(key: QueryKey, updater: Updater<T>): void {
    this.query<T>({ key }).setData(updater)
  }

  /**
   * Cancels in-flight fetches for `key`, applies `updater`, and returns a
   * rollback that restores the previous snapshot (or removes the entry).
   */
  optimistic<T>(key: QueryKey, updater: Updater<T>): () => void {
    const hash = hashKey(key)
    const previous = this.queries.get(hash) as Query<T> | undefined
    const snapshot = previous?.snapshot
    previous?.cancel()
    this.setQueryData(key, updater)
    return () => {
      const current = this.queries.get(hash) as Query<T> | undefined
      if (!current) return
      if (snapshot && snapshot.status !== "idle") current.restore(snapshot)
      else this.removeQueries(key)
    }
  }

  /** Marks matching queries stale; observed ones refetch immediately. */
  invalidate(prefix: QueryKey): Promise<void> {
    return Promise.all(this.find(prefix).map((q) => q.invalidate())).then(noop)
  }

  cancel(prefix: QueryKey): void {
    for (const query of this.find(prefix)) query.cancel()
  }

  removeQueries(prefix: QueryKey): void {
    for (const query of this.find(prefix)) {
      query.destroy()
      this.queries.delete(query.hash)
    }
  }

  /** Aborts everything and empties the cache (e.g. on workspace switch). */
  clearAll(): void {
    for (const query of this.queries.values()) query.destroy()
    this.queries.clear()
  }

  setVisible(visible: boolean): void {
    if (this.visible === visible) return
    this.visible = visible
    for (const query of this.queries.values()) {
      query.onVisibilityChange(visible)
    }
  }

  find(prefix: QueryKey): Query<unknown>[] {
    return [...this.queries.values()].filter((q) => matchKey(prefix, q.key))
  }

  async mutate<V, R, C = unknown>(
    options: MutationOptions<V, R, C>,
    variables: V
  ): Promise<R> {
    let context: C | undefined
    let result: R
    try {
      context = await options.onMutate?.(variables)
      const signal = options.signal ?? new AbortController().signal
      result = await options.mutationFn(variables, { signal })
    } catch (error) {
      await options.onError?.(error, variables, context)
      throw error
    }
    await options.onSuccess?.(result, variables, context)
    const keys =
      typeof options.invalidates === "function"
        ? options.invalidates(result, variables)
        : (options.invalidates ?? [])
    await Promise.all(keys.map((key) => this.invalidate(key)))
    return result
  }
}
