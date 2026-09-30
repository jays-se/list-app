import type { ProtocolError } from "./errors.ts"
import type { UploadProgress } from "./views/tasks.ts"

/**
 * Main ↔ Worker messages (ADR-0007). Everything here must survive
 * structured clone: no functions, class instances, or Dates.
 *
 * - command: main → worker, no reply, applied in send order.
 * - rpc:     main → worker → main, exactly one `reply`.
 * - push:    worker → main, never awaited.
 */

export type ViewStatus = "loading" | "success" | "error"

export interface ViewState<T = unknown> {
  status: ViewStatus
  data?: T
  error?: ProtocolError
  /** True while any query behind the view is fetching (incl. background). */
  isFetching: boolean
  /** Epoch ms of the newest data behind the view; 0 when none yet. */
  updatedAt: number
}

export type Command =
  | {
      kind: "command"
      name: "view.subscribe"
      args: { subId: string; view: string; params: unknown }
    }
  | { kind: "command"; name: "view.unsubscribe"; args: { subId: string } }
  | {
      kind: "command"
      name: "view.prefetch"
      args: { view: string; params: unknown }
    }
  | { kind: "command"; name: "visibility"; args: { visible: boolean } }
  | { kind: "command"; name: "reset"; args: Record<string, never> }

export type CommandName = Command["name"]

export interface Rpc {
  kind: "rpc"
  id: number
  method: "action"
  args: { action: string; input: unknown }
}

export type ToWorker = Command | Rpc

export type Push =
  | { kind: "push"; topic: "ready"; data: Record<string, never> }
  | {
      kind: "push"
      topic: "view"
      /**
       * `dataUnchanged: true` means the view model is structurally identical
       * to the last push: `state.data` is omitted and the bridge keeps its
       * previous object, so React sees a stable reference.
       */
      data: { subId: string; state: ViewState; dataUnchanged?: true }
    }
  | { kind: "push"; topic: "session.expired"; data: Record<string, never> }
  | { kind: "push"; topic: "upload.progress"; data: UploadProgress }
  | { kind: "push"; topic: "fatal"; data: { message: string } }

export type Reply =
  | { kind: "reply"; id: number; ok: true; data: unknown }
  | { kind: "reply"; id: number; ok: false; error: ProtocolError }

export type ToMain = Push | Reply

const COMMANDS: ReadonlySet<string> = new Set<CommandName>([
  "view.subscribe",
  "view.unsubscribe",
  "view.prefetch",
  "visibility",
  "reset",
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** Validates an inbound worker message; the kernel answers BAD_REQUEST otherwise. */
export function isToWorker(value: unknown): value is ToWorker {
  if (!isRecord(value) || !isRecord(value.args)) return false
  if (value.kind === "command") {
    return typeof value.name === "string" && COMMANDS.has(value.name)
  }
  if (value.kind === "rpc") {
    return (
      typeof value.id === "number" &&
      value.method === "action" &&
      typeof value.args.action === "string"
    )
  }
  return false
}

export function isToMain(value: unknown): value is ToMain {
  if (!isRecord(value)) return false
  if (value.kind === "push") return typeof value.topic === "string"
  if (value.kind === "reply") {
    return typeof value.id === "number" && typeof value.ok === "boolean"
  }
  return false
}

/**
 * The transport between bridge and kernel. The web implementation wraps a
 * Dedicated Worker; tests use an inline backend running the same kernel.
 */
export interface Backend {
  send(message: ToWorker): void
  onMessage(listener: (message: ToMain) => void): () => void
  /** Tear down and recreate the underlying worker (crash recovery). */
  restart(): void
  terminate(): void
}
