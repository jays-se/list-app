import { describe, expect, it } from "vitest"
import {
  isProtocolError,
  isToMain,
  isToWorker,
  protocolError,
  stableHash,
  type ToMain,
  type ToWorker,
} from "./index.ts"

describe("stableHash", () => {
  it("ignores object key order", () => {
    expect(stableHash({ a: 1, b: { c: 2, d: 3 } })).toBe(
      stableHash({ b: { d: 3, c: 2 }, a: 1 })
    )
  })

  it("keeps array order significant", () => {
    expect(stableHash([1, 2])).not.toBe(stableHash([2, 1]))
  })

  it("drops undefined members like structured clone", () => {
    expect(stableHash({ a: 1, b: undefined })).toBe(stableHash({ a: 1 }))
  })

  it("distinguishes types", () => {
    expect(stableHash(["1"])).not.toBe(stableHash([1]))
  })
})

describe("message guards", () => {
  const messages: ToWorker[] = [
    {
      kind: "command",
      name: "view.subscribe",
      args: { subId: "s1", view: "system.info", params: {} },
    },
    { kind: "command", name: "view.unsubscribe", args: { subId: "s1" } },
    {
      kind: "command",
      name: "view.prefetch",
      args: { view: "x", params: { a: 1 } },
    },
    { kind: "command", name: "visibility", args: { visible: false } },
    { kind: "command", name: "reset", args: {} },
    { kind: "rpc", id: 1, method: "action", args: { action: "a", input: 1 } },
  ]

  it.each(messages)("accepts and survives structured clone: %o", (msg) => {
    const cloned = structuredClone(msg)
    expect(cloned).toEqual(msg)
    expect(isToWorker(cloned)).toBe(true)
  })

  it.each([
    null,
    "view.subscribe",
    { kind: "command", name: "nope", args: {} },
    { kind: "command", name: "reset" },
    { kind: "rpc", id: "1", method: "action", args: { action: "a" } },
    { kind: "rpc", id: 1, method: "other", args: { action: "a" } },
  ])("rejects malformed worker input %o", (msg) => {
    expect(isToWorker(msg)).toBe(false)
  })

  it("recognizes main-bound messages", () => {
    const pushes: ToMain[] = [
      { kind: "push", topic: "ready", data: {} },
      {
        kind: "push",
        topic: "view",
        data: {
          subId: "s",
          state: { status: "loading", isFetching: true, updatedAt: 0 },
        },
      },
      { kind: "reply", id: 3, ok: true, data: null },
      {
        kind: "reply",
        id: 4,
        ok: false,
        error: protocolError("TIMEOUT", "timed out"),
      },
    ]
    for (const p of pushes) expect(isToMain(structuredClone(p))).toBe(true)
    expect(isToMain({ kind: "reply", id: 1 })).toBe(false)
  })
})

describe("protocolError", () => {
  it("builds a cloneable error with extras", () => {
    const err = protocolError("HTTP_422", "Invalid", {
      status: 422,
      fieldErrors: [{ field: "title", message: "Title is required" }],
    })
    expect(isProtocolError(structuredClone(err))).toBe(true)
    expect(err.code).toBe("HTTP_422")
  })
})
