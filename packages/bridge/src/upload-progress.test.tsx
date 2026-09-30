import type { Backend, ToMain, UploadProgress } from "@app/protocol"
import { act, renderHook } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import { Bridge } from "./bridge.ts"
import { BridgeProvider, useUploadProgress } from "./react.tsx"

function pushingBackend() {
  let listener: ((m: ToMain) => void) | undefined
  const backend: Backend = {
    send: () => {},
    onMessage: (l) => {
      listener = l
      return () => {}
    },
    restart: () => {},
    terminate: () => {},
  }
  const push = (data: UploadProgress) =>
    listener?.({ kind: "push", topic: "upload.progress", data })
  return { backend, push }
}

describe("useUploadProgress", () => {
  it("tracks uploads for one task, drops finished ones, keeps failures until the next upload", () => {
    vi.useFakeTimers()
    const { backend, push } = pushingBackend()
    const bridge = new Bridge(backend)
    const wrapper = ({ children }: { children: ReactNode }) => (
      <BridgeProvider bridge={bridge}>{children}</BridgeProvider>
    )
    const { result } = renderHook(() => useUploadProgress("t1"), { wrapper })
    const p = (over: Partial<UploadProgress>): UploadProgress => ({
      taskId: "t1",
      uploadId: "u1",
      filename: "a.txt",
      percent: 0,
      state: "uploading",
      ...over,
    })

    act(() => {
      push(p({ percent: 40 }))
      push(p({ taskId: "other" }))
    })
    expect(result.current.map((u) => u.percent)).toEqual([40])
    act(() => push(p({ percent: 100, state: "done" })))
    expect(result.current[0]?.state).toBe("done")
    act(() => vi.advanceTimersByTime(1500))
    expect(result.current).toEqual([])

    act(() => push(p({ uploadId: "u2", state: "failed", error: "too big" })))
    expect(result.current.map((u) => u.state)).toEqual(["failed"])
    act(() => push(p({ uploadId: "u3", percent: 10 })))
    expect(result.current.map((u) => u.uploadId)).toEqual(["u3"])
    vi.useRealTimers()
    bridge.dispose()
  })
})
