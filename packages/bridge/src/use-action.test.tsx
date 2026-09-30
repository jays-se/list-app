import type { Backend, ToMain } from "@app/protocol"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it } from "vitest"
import { Bridge } from "./bridge.ts"
import { BridgeProvider, useAction, useBridge } from "./react.tsx"

function replyingBackend(ok: boolean): Backend {
  let listener: ((m: ToMain) => void) | undefined
  return {
    send(m) {
      if (m.kind !== "rpc") return
      queueMicrotask(() =>
        listener?.(
          ok
            ? { kind: "reply", id: m.id, ok: true, data: "done" }
            : {
                kind: "reply",
                id: m.id,
                ok: false,
                error: { code: "HTTP_409", message: "Conflict" },
              }
        )
      )
    },
    onMessage(l) {
      listener = l
      return () => {}
    },
    restart() {},
    terminate() {},
  }
}

function wrapper(bridge: Bridge) {
  return ({ children }: { children: ReactNode }) => (
    <BridgeProvider bridge={bridge}>{children}</BridgeProvider>
  )
}

describe("useAction", () => {
  it("tracks pending and resolves with the result", async () => {
    const bridge = new Bridge(replyingBackend(true))
    const { result } = renderHook(() => useAction("x" as never), {
      wrapper: wrapper(bridge),
    })
    let promise: Promise<unknown> | undefined
    act(() => {
      promise = result.current.run(undefined as never)
    })
    expect(result.current.pending).toBe(true)
    await act(async () => {
      await expect(promise).resolves.toBe("done")
    })
    expect(result.current.pending).toBe(false)
    expect(result.current.error).toBeUndefined()
  })

  it("exposes the protocol error and can reset it", async () => {
    const bridge = new Bridge(replyingBackend(false))
    const { result } = renderHook(() => useAction("x" as never), {
      wrapper: wrapper(bridge),
    })
    await act(async () => {
      await result.current.run(undefined as never).catch(() => {})
    })
    expect(result.current.error).toEqual({
      code: "HTTP_409",
      message: "Conflict",
    })
    act(() => result.current.reset())
    expect(result.current.error).toBeUndefined()
  })

  it("useBridge throws outside a provider", () => {
    expect(() => renderHook(() => useBridge())).toThrow(/BridgeProvider/)
  })
})
