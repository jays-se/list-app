import type { ToMain } from "@app/protocol"
import { describe, expect, it } from "vitest"
import { createWorkerBackend } from "./worker-backend.ts"

class FakeWorker extends EventTarget {
  posted: unknown[] = []
  terminated = false
  postMessage(message: unknown) {
    this.posted.push(message)
  }
  terminate() {
    this.terminated = true
  }
  emit(data: unknown) {
    this.dispatchEvent(new MessageEvent("message", { data }))
  }
  crash(message: string) {
    this.dispatchEvent(new ErrorEvent("error", { message }))
  }
}

function setup() {
  const workers: FakeWorker[] = []
  const backend = createWorkerBackend(() => {
    const w = new FakeWorker()
    workers.push(w)
    return w as unknown as Worker
  })
  const received: ToMain[] = []
  backend.onMessage((m) => received.push(m))
  return { backend, workers, received }
}

describe("createWorkerBackend", () => {
  it("posts to the worker and forwards valid main-bound messages only", () => {
    const { backend, workers, received } = setup()
    backend.send({ kind: "command", name: "reset", args: {} })
    expect(workers[0]?.posted).toHaveLength(1)
    workers[0]?.emit({ kind: "push", topic: "ready", data: {} })
    workers[0]?.emit({ junk: true })
    expect(received).toEqual([{ kind: "push", topic: "ready", data: {} }])
  })

  it("turns worker errors into a fatal push", () => {
    const { workers, received } = setup()
    workers[0]?.crash("boom")
    workers[0]?.dispatchEvent(new MessageEvent("messageerror"))
    expect(received.map((m) => (m.kind === "push" ? m.topic : ""))).toEqual([
      "fatal",
      "fatal",
    ])
  })

  it("restart terminates the old worker and uses a new one", () => {
    const { backend, workers } = setup()
    backend.restart()
    expect(workers[0]?.terminated).toBe(true)
    backend.send({ kind: "command", name: "reset", args: {} })
    expect(workers[1]?.posted).toHaveLength(1)
    backend.terminate()
    expect(workers[1]?.terminated).toBe(true)
  })
})
