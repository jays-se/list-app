import { abortError, isAbortError, sleep } from "./retry.ts"
import type {
  FetchContext,
  QueryKey,
  QueryOptions,
  QuerySnapshot,
  Updater,
} from "./types.ts"

export interface QueryEnv {
  now: () => number
  isVisible: () => boolean
  isRetryable: (error: unknown) => boolean
  retryDelay: (attempt: number) => number
  defaults: { ttl: number; gcTime: number; retry: number }
  onGc: (query: Query<unknown>) => void
}

type Listener<T> = (snapshot: QuerySnapshot<T>) => void
type Timer = ReturnType<typeof setTimeout>

const noop = () => {}

/**
 * One cache entry. Holds the snapshot, the in-flight request, and the
 * polling/GC timers. Listeners count as observers: the first one triggers a
 * fetch when stale and starts polling; the last one leaving schedules GC.
 */
export class Query<T> {
  private state: QuerySnapshot<T> = {
    status: "idle",
    isFetching: false,
    updatedAt: 0,
  }
  private readonly listeners = new Set<Listener<T>>()
  private controller: AbortController | null = null
  private promise: Promise<T> | null = null
  private invalidated = false
  private pollTimer: Timer | undefined
  private gcTimer: Timer | undefined
  private destroyed = false

  constructor(
    readonly key: QueryKey,
    readonly hash: string,
    public options: QueryOptions<T>,
    private readonly env: QueryEnv
  ) {}

  get snapshot(): QuerySnapshot<T> {
    return this.state
  }

  get observerCount(): number {
    return this.listeners.size
  }

  private get ttl() {
    return this.options.ttl ?? this.env.defaults.ttl
  }

  private get gcTime() {
    return this.options.gcTime ?? this.env.defaults.gcTime
  }

  isStale(): boolean {
    if (this.invalidated || this.state.updatedAt === 0) return true
    return this.env.now() - this.state.updatedAt >= this.ttl
  }

  subscribe(listener: Listener<T>): () => void {
    this.listeners.add(listener)
    clearTimeout(this.gcTimer)
    if (this.listeners.size === 1) {
      if (this.isStale()) this.fetch().catch(noop)
      else this.schedulePoll()
    }
    return () => {
      if (!this.listeners.delete(listener)) return
      if (this.listeners.size === 0) {
        this.stopPolling()
        this.scheduleGc()
      }
    }
  }

  /** Fetches, deduplicating with an in-flight request unless `force`. */
  fetch(force = false): Promise<T> {
    if (this.destroyed) return Promise.reject(abortError())
    if (this.promise && !force) return this.promise
    const fetcher = this.options.fetcher
    if (!fetcher) {
      return this.state.status === "success"
        ? Promise.resolve(this.state.data as T)
        : Promise.reject(new Error(`No fetcher for query ${this.hash}`))
    }

    this.controller?.abort()
    const controller = new AbortController()
    this.controller = controller
    this.stopPolling()
    this.setState({
      isFetching: true,
      status: this.state.status === "idle" ? "loading" : this.state.status,
    })

    const promise = this.run(fetcher, { signal: controller.signal }).then(
      (data) => {
        if (this.controller !== controller) return this.promise ?? data
        this.settle()
        this.invalidated = false
        this.setState({
          status: "success",
          data,
          error: undefined,
          isFetching: false,
          updatedAt: this.env.now(),
        })
        this.schedulePoll()
        return data
      },
      (error: unknown) => {
        if (this.controller !== controller) {
          if (this.promise) return this.promise
          throw error
        }
        this.settle()
        if (isAbortError(error) || controller.signal.aborted) {
          this.setState({ isFetching: false })
          throw error
        }
        this.setState({ status: "error", error, isFetching: false })
        this.schedulePoll()
        throw error
      }
    )
    this.promise = promise
    return promise
  }

  setData(updater: Updater<T>): void {
    const data =
      typeof updater === "function"
        ? (updater as (previous: T | undefined) => T)(this.state.data)
        : updater
    this.setState({
      status: "success",
      data,
      error: undefined,
      updatedAt: this.env.now(),
    })
  }

  /** Restores a previous snapshot (used for optimistic-update rollback). */
  restore(snapshot: QuerySnapshot<T>): void {
    this.setState({ ...snapshot, isFetching: this.controller !== null })
  }

  /** Marks stale; refetches now if observed, else on next observe/fetch. */
  invalidate(): Promise<void> {
    this.invalidated = true
    if (this.listeners.size === 0) return Promise.resolve()
    return this.fetch(true).then(noop, noop)
  }

  cancel(): void {
    if (!this.controller) return
    this.controller.abort()
    this.settle()
    this.setState({ isFetching: false })
  }

  /** Called by the client when tab visibility changes. */
  onVisibilityChange(visible: boolean): void {
    if (!visible) {
      this.stopPolling()
      return
    }
    if (this.listeners.size === 0 || this.controller) return
    if (this.isStale() || this.pollDue()) this.fetch().catch(noop)
    else this.schedulePoll()
  }

  destroy(): void {
    this.destroyed = true
    this.controller?.abort()
    this.settle()
    this.stopPolling()
    clearTimeout(this.gcTimer)
    this.listeners.clear()
  }

  private async run(
    fetcher: (ctx: FetchContext) => Promise<T>,
    ctx: FetchContext
  ): Promise<T> {
    const retries = this.options.retry ?? this.env.defaults.retry
    for (let attempt = 0; ; attempt++) {
      try {
        return await fetcher(ctx)
      } catch (error) {
        const retryable = !ctx.signal.aborted && this.env.isRetryable(error)
        if (attempt >= retries || !retryable) throw error
        await sleep(this.env.retryDelay(attempt), ctx.signal)
      }
    }
  }

  private settle() {
    this.controller = null
    this.promise = null
  }

  private pollDue(): boolean {
    const interval = this.options.refetchInterval ?? 0
    return interval > 0 && this.env.now() - this.state.updatedAt >= interval
  }

  private schedulePoll() {
    this.stopPolling()
    const interval = this.options.refetchInterval ?? 0
    if (interval <= 0 || this.listeners.size === 0 || !this.env.isVisible()) {
      return
    }
    const elapsed = this.env.now() - this.state.updatedAt
    const delay = Math.max(0, interval - Math.max(0, elapsed))
    this.pollTimer = setTimeout(() => {
      this.fetch().catch(noop)
    }, delay)
  }

  private stopPolling() {
    clearTimeout(this.pollTimer)
    this.pollTimer = undefined
  }

  private scheduleGc() {
    clearTimeout(this.gcTimer)
    if (!Number.isFinite(this.gcTime)) return
    this.gcTimer = setTimeout(() => {
      if (this.listeners.size === 0) this.env.onGc(this as Query<unknown>)
    }, this.gcTime)
  }

  private setState(patch: Partial<QuerySnapshot<T>>) {
    const next = { ...this.state, ...patch }
    if (patch.error === undefined && "error" in patch) delete next.error
    this.state = next
    for (const listener of [...this.listeners]) listener(next)
  }
}
