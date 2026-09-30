import type {
  ActionDefinition,
  DomainContext,
  ViewDefinition,
} from "@app/domain"
import {
  isProtocolError,
  isToWorker,
  type ProtocolError,
  protocolError,
  stableHash,
  type ToMain,
  type ViewState,
} from "@app/protocol"
import type { QueryOptions, QuerySnapshot } from "@app/query"

export interface KernelOptions {
  views: Readonly<Record<string, ViewDefinition<unknown, unknown>>>
  actions: Readonly<Record<string, ActionDefinition<unknown, unknown>>>
  context: DomainContext
  post: (message: ToMain) => void
}

interface Subscription {
  subId: string
  view: string
  params: unknown
  definition: ViewDefinition<unknown, unknown>
  queries: [name: string, options: QueryOptions<unknown>][]
  unsubscribes: (() => void)[]
  scheduled: boolean
  lastMetaHash: string | undefined
  lastDataHash: string | undefined
}

/**
 * The worker's end of the protocol (ADR-0007). Owns view subscriptions:
 * observes each view's queries, recomputes the view model when any of them
 * changes (batched per microtask), and pushes only real changes.
 */
export class WorkerKernel {
  private readonly subs = new Map<string, Subscription>()
  private readonly ctx: DomainContext

  constructor(private readonly options: KernelOptions) {
    this.ctx = options.context
    options.post({ kind: "push", topic: "ready", data: {} })
  }

  handle(message: unknown): void {
    if (!isToWorker(message)) {
      const id = (message as { id?: unknown } | null)?.id
      if (typeof id === "number") {
        this.reply(id, protocolError("BAD_REQUEST", "Malformed message"))
      }
      return
    }
    if (message.kind === "rpc") {
      void this.runAction(message.id, message.args.action, message.args.input)
      return
    }
    switch (message.name) {
      case "view.subscribe":
        this.subscribe(
          message.args.subId,
          message.args.view,
          message.args.params
        )
        break
      case "view.unsubscribe":
        this.unsubscribe(message.args.subId)
        break
      case "view.prefetch":
        this.prefetch(message.args.view, message.args.params)
        break
      case "visibility":
        this.ctx.client.setVisible(message.args.visible)
        break
      case "reset":
        this.reset()
        break
    }
  }

  /** Stops every subscription and empties the cache. */
  dispose(): void {
    for (const sub of this.subs.values()) {
      for (const off of sub.unsubscribes) off()
    }
    this.subs.clear()
    this.ctx.client.clearAll()
  }

  private subscribe(subId: string, view: string, params: unknown) {
    this.unsubscribe(subId)
    const definition = this.options.views[view]
    if (!definition) {
      this.pushView(subId, {
        status: "error",
        isFetching: false,
        updatedAt: 0,
        error: protocolError("BAD_REQUEST", `Unknown view "${view}"`),
      })
      return
    }
    const sub: Subscription = {
      subId,
      view,
      params,
      definition,
      queries: Object.entries(definition.queries(params, this.ctx)),
      unsubscribes: [],
      scheduled: false,
      lastMetaHash: undefined,
      lastDataHash: undefined,
    }
    this.subs.set(subId, sub)
    this.observe(sub)
    this.schedule(sub)
  }

  private observe(sub: Subscription) {
    sub.unsubscribes = sub.queries.map(([, options]) =>
      this.ctx.client.observe(options, () => this.schedule(sub))
    )
  }

  private unsubscribe(subId: string) {
    const sub = this.subs.get(subId)
    if (!sub) return
    for (const off of sub.unsubscribes) off()
    this.subs.delete(subId)
  }

  private prefetch(view: string, params: unknown) {
    const definition = this.options.views[view]
    if (!definition) return
    for (const options of Object.values(definition.queries(params, this.ctx))) {
      void this.ctx.client.prefetch(options)
    }
  }

  private reset() {
    const subs = [...this.subs.values()]
    for (const sub of subs) for (const off of sub.unsubscribes) off()
    this.ctx.client.clearAll()
    for (const sub of subs) {
      sub.lastMetaHash = undefined
      sub.lastDataHash = undefined
      this.observe(sub)
      this.schedule(sub)
    }
  }

  private schedule(sub: Subscription) {
    if (sub.scheduled) return
    sub.scheduled = true
    queueMicrotask(() => {
      sub.scheduled = false
      if (this.subs.get(sub.subId) === sub) this.flush(sub)
    })
  }

  private flush(sub: Subscription) {
    const snapshots = sub.queries.map(
      ([name, options]) =>
        [
          name,
          this.ctx.client.getSnapshot<unknown>(options.key) ?? idleSnapshot,
        ] as const
    )
    const state = this.computeState(sub, snapshots)
    const { data, ...meta } = state
    const metaHash = stableHash(meta)
    const dataHash = data === undefined ? undefined : stableHash(data)
    if (metaHash === sub.lastMetaHash && dataHash === sub.lastDataHash) return
    const dataUnchanged =
      dataHash !== undefined && dataHash === sub.lastDataHash
    sub.lastMetaHash = metaHash
    sub.lastDataHash = dataHash
    this.pushView(sub.subId, dataUnchanged ? meta : state, dataUnchanged)
  }

  private computeState(
    sub: Subscription,
    snapshots: (readonly [string, QuerySnapshot<unknown>])[]
  ): ViewState {
    const isFetching = snapshots.some(([, s]) => s.isFetching)
    const failed = snapshots.find(([, s]) => s.status === "error")?.[1]
    const error = failed ? toProtocolError(failed.error) : undefined
    const ready = snapshots.every(([, s]) => s.data !== undefined)
    if (!ready) {
      return error
        ? { status: "error", error, isFetching, updatedAt: 0 }
        : { status: "loading", isFetching: true, updatedAt: 0 }
    }
    const updatedAt = Math.max(0, ...snapshots.map(([, s]) => s.updatedAt))
    try {
      const data = sub.definition.compute(
        Object.fromEntries(snapshots.map(([name, s]) => [name, s.data])),
        sub.params,
        this.ctx
      )
      return {
        status: "success",
        data,
        isFetching,
        updatedAt,
        ...(error ? { error } : {}),
      }
    } catch (cause) {
      return {
        status: "error",
        error: toProtocolError(cause),
        isFetching,
        updatedAt,
      }
    }
  }

  private async runAction(id: number, action: string, input: unknown) {
    const definition = this.options.actions[action]
    if (!definition) {
      return this.reply(
        id,
        protocolError("BAD_REQUEST", `Unknown action "${action}"`)
      )
    }
    try {
      const data = await definition.run(input, this.ctx)
      this.options.post({ kind: "reply", id, ok: true, data })
    } catch (error) {
      this.reply(id, toProtocolError(error))
    }
  }

  private reply(id: number, error: ProtocolError) {
    this.options.post({ kind: "reply", id, ok: false, error })
  }

  private pushView(subId: string, state: ViewState, dataUnchanged = false) {
    this.options.post({
      kind: "push",
      topic: "view",
      data: dataUnchanged ? { subId, state, dataUnchanged } : { subId, state },
    })
  }
}

const idleSnapshot: QuerySnapshot<unknown> = {
  status: "idle",
  isFetching: false,
  updatedAt: 0,
}

export function toProtocolError(error: unknown): ProtocolError {
  if (isProtocolError(error)) return error
  const convertible = error as { toProtocolError?: () => ProtocolError } | null
  if (typeof convertible?.toProtocolError === "function") {
    return convertible.toProtocolError()
  }
  if ((error as { name?: unknown } | null)?.name === "AbortError") {
    return protocolError("FAILED", "The request was cancelled")
  }
  return protocolError(
    "FAILED",
    error instanceof Error ? error.message : "Something went wrong"
  )
}
