import type { Backend, ToMain, ToWorker } from "@app/protocol"
import { createInlineBackend, createKernel } from "@app/worker"
import { act, cleanup, render, screen } from "@testing-library/react"
import { StrictMode } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { Bridge } from "./bridge.ts"
import { BridgeProvider, useBridgeStatus, useView } from "./react.tsx"

const startedAt = "2026-09-30T10:00:00.000Z"

function systemFetch(version = "0.1.0") {
  return vi.fn<typeof fetch>(async () =>
    Response.json({ service: "list-api", version, startedAt })
  )
}

function inline(fetch: typeof globalThis.fetch) {
  const sent: ToWorker[] = []
  const backend = createInlineBackend((post) =>
    createKernel({ post, fetch, now: () => Date.parse(startedAt) + 60_000 })
  )
  const send = backend.send
  backend.send = (message) => {
    sent.push(message)
    send(message)
  }
  return { backend, sent }
}

function SystemInfo() {
  const info = useView("system.info", {})
  const status = useBridgeStatus()
  if (info.status === "loading") return <p>loading</p>
  if (info.status === "error") return <p role="alert">{info.error?.message}</p>
  return (
    <p>
      {info.data?.service} {info.data?.version} up {info.data?.uptimeText} (
      {status})
    </p>
  )
}

const bridges: Bridge[] = []
function makeBridge(backend: Backend, options = {}) {
  const bridge = new Bridge(backend, options)
  bridges.push(bridge)
  return bridge
}

afterEach(() => {
  cleanup()
  for (const b of bridges.splice(0)) b.dispose()
  vi.useRealTimers()
})

describe("useView through the inline worker backend", () => {
  it("renders loading, then the worker-computed view model", async () => {
    const { backend } = inline(systemFetch())
    const bridge = makeBridge(backend)
    render(
      <BridgeProvider bridge={bridge}>
        <SystemInfo />
      </BridgeProvider>
    )
    expect(screen.getByText("loading")).toBeTruthy()
    expect(await screen.findByText("list-api 0.1.0 up 1m (ready)")).toBeTruthy()
  })

  it("subscribes once in StrictMode and for components sharing a view", async () => {
    const { backend, sent } = inline(systemFetch())
    const bridge = makeBridge(backend)
    render(
      <StrictMode>
        <BridgeProvider bridge={bridge}>
          <SystemInfo />
          <SystemInfo />
        </BridgeProvider>
      </StrictMode>
    )
    await screen.findAllByText(/list-api/)
    const subscribes = sent.filter(
      (m) => m.kind === "command" && m.name === "view.subscribe"
    )
    expect(subscribes).toHaveLength(1)
  })

  it("unsubscribes from the worker when the last component unmounts", async () => {
    const { backend, sent } = inline(systemFetch())
    const bridge = makeBridge(backend)
    const view = render(
      <BridgeProvider bridge={bridge}>
        <SystemInfo />
      </BridgeProvider>
    )
    await screen.findByText(/list-api/)
    view.unmount()
    await act(async () => {})
    expect(
      sent.some((m) => m.kind === "command" && m.name === "view.unsubscribe")
    ).toBe(true)
  })
})

describe("Bridge", () => {
  it("keeps the same data reference when the worker reports no change", async () => {
    const { backend } = inline(systemFetch())
    const bridge = makeBridge(backend)
    const handle = bridge.view("system.info", {})
    const off = handle.subscribe(() => {})
    await vi.waitFor(() => expect(handle.getSnapshot().status).toBe("success"))
    const first = handle.getSnapshot().data
    bridge.reset()
    await vi.waitFor(() => expect(handle.getSnapshot().isFetching).toBe(false))
    expect(handle.getSnapshot().data).toBe(first)
    off()
  })

  it("rejects an RPC with TIMEOUT when the worker never replies", async () => {
    vi.useFakeTimers()
    const silent: Backend = {
      send: () => {},
      onMessage: () => () => {},
      restart: () => {},
      terminate: () => {},
    }
    const bridge = makeBridge(silent, { timeoutMs: 500 })
    const result = bridge.run("any" as never, undefined as never)
    const assertion = expect(result).rejects.toMatchObject({ code: "TIMEOUT" })
    await vi.advanceTimersByTimeAsync(500)
    await assertion
  })

  it("resolves and rejects RPCs from worker replies", async () => {
    let listener: ((m: ToMain) => void) | undefined
    const backend: Backend = {
      send: (m) => {
        if (m.kind !== "rpc") return
        queueMicrotask(() =>
          listener?.(
            m.id === 1
              ? { kind: "reply", id: 1, ok: true, data: "yes" }
              : {
                  kind: "reply",
                  id: m.id,
                  ok: false,
                  error: { code: "HTTP_403", message: "Forbidden" },
                }
          )
        )
      },
      onMessage: (l) => {
        listener = l
        return () => {}
      },
      restart: () => {},
      terminate: () => {},
    }
    const bridge = makeBridge(backend)
    await expect(bridge.run("a" as never, undefined as never)).resolves.toBe(
      "yes"
    )
    await expect(
      bridge.run("b" as never, undefined as never)
    ).rejects.toMatchObject({ code: "HTTP_403" })
  })

  it("restarts the worker once and resubscribes, then goes fatal", async () => {
    const { backend, sent } = inline(systemFetch())
    const bridge = makeBridge(backend, { maxRestarts: 1 })
    const handle = bridge.view("system.info", {})
    const off = handle.subscribe(() => {})
    await vi.waitFor(() => expect(handle.getSnapshot().status).toBe("success"))

    backend.simulateCrash()
    await vi.waitFor(() => expect(bridge.getStatus()).toBe("ready"))
    const subscribes = sent.filter(
      (m) => m.kind === "command" && m.name === "view.subscribe"
    )
    expect(subscribes).toHaveLength(2)
    await vi.waitFor(() => expect(handle.getSnapshot().status).toBe("success"))

    backend.simulateCrash("gone")
    await vi.waitFor(() => expect(bridge.getStatus()).toBe("fatal"))
    expect(handle.getSnapshot()).toMatchObject({
      status: "error",
      error: { code: "WORKER_FAILED" },
    })
    await expect(
      bridge.run("x" as never, undefined as never)
    ).rejects.toMatchObject({ code: "WORKER_FAILED" })
    off()
  })

  it("notifies session expiry listeners", async () => {
    const { backend } = inline(
      vi.fn<typeof fetch>(async () => Response.json({}, { status: 401 }))
    )
    const bridge = makeBridge(backend)
    const onExpired = vi.fn()
    bridge.onSessionExpired(onExpired)
    const off = bridge.view("system.info", {}).subscribe(() => {})
    await vi.waitFor(() => expect(onExpired).toHaveBeenCalled())
    off()
  })
})

describe("useView keepPrevious", () => {
  it("keeps the last result while new params load", async () => {
    const { renderHook } = await import("@testing-library/react")
    const { backend } = inline(systemFetch())
    const bridge = makeBridge(backend)
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <BridgeProvider bridge={bridge}>{children}</BridgeProvider>
    )
    const { result, rerender } = renderHook(
      ({ key }: { key: string }) =>
        useView("system.info", { key } as never, { keepPrevious: true }),
      { wrapper, initialProps: { key: "a" } }
    )
    await vi.waitFor(() => expect(result.current.status).toBe("success"))
    rerender({ key: "b" })
    expect(result.current.status).toBe("success")
    expect(result.current.isFetching).toBe(true)
    expect(result.current.data?.service).toBe("list-api")
  })
})
