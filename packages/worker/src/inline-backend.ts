import type { Backend, ToMain } from "@app/protocol"

interface KernelLike {
  handle(message: unknown): void
  dispose(): void
}

export interface InlineBackend extends Backend {
  /** Test hook: behave as if the worker crashed. */
  simulateCrash(message?: string): void
}

/**
 * Runs the kernel on the current thread (tests, and later React Native).
 * Messages still pass through `structuredClone` asynchronously, so the
 * worker boundary is exercised exactly as in production.
 */
export function createInlineBackend(
  create: (post: (message: ToMain) => void) => KernelLike
): InlineBackend {
  const listeners = new Set<(message: ToMain) => void>()
  let generation = 0
  let stopped = false

  function start(): KernelLike {
    const current = ++generation
    return create((message) => {
      const copy = structuredClone(message)
      queueMicrotask(() => {
        if (stopped || current !== generation) return
        for (const listener of listeners) listener(copy)
      })
    })
  }

  let kernel = start()

  return {
    send(message) {
      const copy = structuredClone(message)
      const target = kernel
      queueMicrotask(() => {
        if (!stopped && target === kernel) target.handle(copy)
      })
    },
    onMessage(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    restart() {
      kernel.dispose()
      kernel = start()
    },
    terminate() {
      stopped = true
      kernel.dispose()
      listeners.clear()
    },
    simulateCrash(message = "Simulated worker crash") {
      kernel.dispose()
      generation++
      const push: ToMain = { kind: "push", topic: "fatal", data: { message } }
      queueMicrotask(() => {
        for (const listener of listeners) listener(push)
      })
    },
  }
}
