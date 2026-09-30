import { type Backend, isToMain, type ToMain } from "@app/protocol"

/**
 * Backend over a Dedicated Worker. Worker `error`/`messageerror` events are
 * surfaced as a `fatal` push so the bridge can restart it (ADR-0007).
 */
export function createWorkerBackend(factory: () => Worker): Backend {
  const listeners = new Set<(message: ToMain) => void>()
  let worker = attach(factory())

  function emit(message: ToMain) {
    for (const listener of [...listeners]) listener(message)
  }

  function attach(next: Worker): Worker {
    next.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (isToMain(event.data)) emit(event.data)
    })
    next.addEventListener("error", (event: ErrorEvent) => {
      emit({
        kind: "push",
        topic: "fatal",
        data: { message: event.message || "The data worker crashed" },
      })
    })
    next.addEventListener("messageerror", () => {
      emit({
        kind: "push",
        topic: "fatal",
        data: { message: "A message could not be decoded" },
      })
    })
    return next
  }

  return {
    send: (message) => worker.postMessage(message),
    onMessage(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    restart() {
      worker.terminate()
      worker = attach(factory())
    },
    terminate() {
      worker.terminate()
      listeners.clear()
    },
  }
}
