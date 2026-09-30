import {
  type ActionInput,
  type ActionKey,
  type ActionResult,
  type Backend,
  type ErrorReport,
  type ProtocolError,
  protocolError,
  stableHash,
  type ToMain,
  type UploadProgress,
  type ViewData,
  type ViewKey,
  type ViewParams,
  type ViewState,
} from "@app/protocol"

export type BridgeStatus = "starting" | "ready" | "restarting" | "fatal"

export interface BridgeOptions {
  /** RPC deadline in ms (ADR-0007). Default 10 000. */
  timeoutMs?: number
  /** Automatic worker restarts before giving up. Default 1. */
  maxRestarts?: number
}

export interface ViewHandle<T> {
  subscribe: (listener: () => void) => () => void
  getSnapshot: () => ViewState<T>
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: ProtocolError) => void
  timer: ReturnType<typeof setTimeout>
}

const LOADING: ViewState<never> = {
  status: "loading",
  isFetching: true,
  updatedAt: 0,
}

class Handle<T> implements ViewHandle<T> {
  private state: ViewState<T> = LOADING
  private readonly listeners = new Set<() => void>()
  subId: string

  constructor(
    private readonly bridge: Bridge,
    readonly cacheKey: string,
    readonly view: string,
    readonly params: unknown
  ) {
    this.subId = bridge.nextSubId()
  }

  get active() {
    return this.listeners.size > 0
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    if (this.listeners.size === 1) this.bridge.activate(this)
    return () => {
      this.listeners.delete(listener)
      // Deferred so React StrictMode's unmount/remount doesn't churn the worker.
      queueMicrotask(() => {
        if (this.listeners.size === 0) this.bridge.deactivate(this)
      })
    }
  }

  getSnapshot = () => this.state

  apply(state: ViewState, dataUnchanged: boolean) {
    const next = state as ViewState<T>
    this.state =
      dataUnchanged && this.state.data !== undefined
        ? { ...next, data: this.state.data }
        : next
    for (const listener of [...this.listeners]) listener()
  }
}

/**
 * Main-thread end of the protocol. React talks only to this (ADR-0005):
 * views are subscribed by key + params, actions are RPCs with a deadline.
 */
export class Bridge {
  private readonly handles = new Map<string, Handle<unknown>>()
  private readonly bySubId = new Map<string, Handle<unknown>>()
  private readonly pending = new Map<number, Pending>()
  private readonly statusListeners = new Set<() => void>()
  private readonly sessionListeners = new Set<() => void>()
  private readonly uploadListeners = new Set<(p: UploadProgress) => void>()
  private readonly timeoutMs: number
  private readonly maxRestarts: number
  private readonly offMessage: () => void
  private status: BridgeStatus = "starting"
  private restarts = 0
  private rpcId = 0
  private subCounter = 0

  constructor(
    private readonly backend: Backend,
    options: BridgeOptions = {}
  ) {
    this.timeoutMs = options.timeoutMs ?? 10_000
    this.maxRestarts = options.maxRestarts ?? 1
    this.offMessage = backend.onMessage((message) => this.receive(message))
  }

  view<K extends ViewKey>(
    view: K,
    params: ViewParams<K>
  ): ViewHandle<ViewData<K>> {
    const cacheKey = `${view}:${stableHash(params)}`
    let handle = this.handles.get(cacheKey)
    if (!handle) {
      handle = new Handle(this, cacheKey, view, params)
      this.handles.set(cacheKey, handle)
    }
    return handle as ViewHandle<ViewData<K>>
  }

  prefetch<K extends ViewKey>(view: K, params: ViewParams<K>): void {
    this.backend.send({
      kind: "command",
      name: "view.prefetch",
      args: { view, params },
    })
  }

  run<K extends ActionKey>(
    action: K,
    input: ActionInput<K>,
    options: { timeoutMs?: number } = {}
  ): Promise<ActionResult<K>> {
    if (this.status === "fatal") {
      return Promise.reject(workerFailed("The data worker is unavailable"))
    }
    const id = ++this.rpcId
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(protocolError("TIMEOUT", `"${action}" timed out`))
      }, options.timeoutMs ?? this.timeoutMs)
      this.pending.set(id, {
        resolve: resolve as (value: unknown) => void,
        reject,
        timer,
      })
      this.backend.send({
        kind: "rpc",
        id,
        method: "action",
        args: { action, input },
      })
    })
  }

  /** Forwards an unexpected main-thread error to the worker (E12-S1). */
  reportError(report: ErrorReport): void {
    this.backend.send({ kind: "command", name: "error.report", args: report })
  }

  setVisible(visible: boolean): void {
    this.backend.send({
      kind: "command",
      name: "visibility",
      args: { visible },
    })
  }

  /** Drops all worker data and refetches active views (workspace switch). */
  reset(): void {
    this.backend.send({ kind: "command", name: "reset", args: {} })
  }

  getStatus = (): BridgeStatus => this.status

  subscribeStatus = (listener: () => void): (() => void) => {
    this.statusListeners.add(listener)
    return () => this.statusListeners.delete(listener)
  }

  onSessionExpired(listener: () => void): () => void {
    this.sessionListeners.add(listener)
    return () => this.sessionListeners.delete(listener)
  }

  /** Upload progress pushed by the worker (topic "upload.progress"). */
  onUploadProgress(listener: (p: UploadProgress) => void): () => void {
    this.uploadListeners.add(listener)
    return () => this.uploadListeners.delete(listener)
  }

  dispose(): void {
    this.offMessage()
    this.rejectPending("The bridge was stopped")
    this.backend.terminate()
  }

  /** @internal */
  nextSubId(): string {
    return `v${++this.subCounter}`
  }

  /** @internal Called by a handle when its first listener arrives. */
  activate(handle: Handle<unknown>): void {
    if (!this.handles.has(handle.cacheKey)) {
      this.handles.set(handle.cacheKey, handle)
    }
    if (this.bySubId.get(handle.subId) === handle) return
    this.bySubId.set(handle.subId, handle)
    this.sendSubscribe(handle)
  }

  /** @internal Called when a handle's last listener has left. */
  deactivate(handle: Handle<unknown>): void {
    if (this.bySubId.get(handle.subId) !== handle) return
    this.bySubId.delete(handle.subId)
    if (this.handles.get(handle.cacheKey) === handle) {
      this.handles.delete(handle.cacheKey)
    }
    this.backend.send({
      kind: "command",
      name: "view.unsubscribe",
      args: { subId: handle.subId },
    })
  }

  private sendSubscribe(handle: Handle<unknown>) {
    this.backend.send({
      kind: "command",
      name: "view.subscribe",
      args: { subId: handle.subId, view: handle.view, params: handle.params },
    })
  }

  private receive(message: ToMain) {
    if (message.kind === "reply") {
      const pending = this.pending.get(message.id)
      if (!pending) return
      this.pending.delete(message.id)
      clearTimeout(pending.timer)
      if (message.ok) pending.resolve(message.data)
      else pending.reject(message.error)
      return
    }
    switch (message.topic) {
      case "ready":
        return this.setStatus("ready")
      case "view": {
        const { subId, state, dataUnchanged } = message.data
        this.bySubId.get(subId)?.apply(state, dataUnchanged === true)
        return
      }
      case "session.expired":
        for (const listener of [...this.sessionListeners]) listener()
        return
      case "upload.progress":
        for (const listener of [...this.uploadListeners]) listener(message.data)
        return
      case "fatal":
        return this.onFatal(message.data.message)
    }
  }

  private onFatal(message: string) {
    this.rejectPending(message)
    if (this.restarts < this.maxRestarts) {
      this.restarts++
      this.setStatus("restarting")
      this.backend.restart()
      for (const handle of this.bySubId.values()) this.sendSubscribe(handle)
      return
    }
    this.setStatus("fatal")
    const error = workerFailed(message)
    for (const handle of this.bySubId.values()) {
      const previous = handle.getSnapshot()
      handle.apply(
        { ...previous, status: "error", error, isFetching: false },
        true
      )
    }
  }

  private rejectPending(message: string) {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer)
      pending.reject(workerFailed(message))
      this.pending.delete(id)
    }
  }

  private setStatus(status: BridgeStatus) {
    if (this.status === status) return
    this.status = status
    for (const listener of [...this.statusListeners]) listener()
  }
}

function workerFailed(message: string): ProtocolError {
  return protocolError("WORKER_FAILED", message)
}
