import { type DomainContext, defineAction, defineView } from "@app/domain"
import type { ToMain, ToWorker } from "@app/protocol"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"
import { toProtocolError } from "./kernel.ts"

type Counter = { n: number }

function setup(options: { interval?: number } = {}) {
  let n = 0
  const fetch = vi.fn<typeof globalThis.fetch>(async (url) => {
    if (String(url).endsWith("/fail")) {
      return Response.json(
        { title: "Nope", detail: "Not allowed", status: 403 },
        { status: 403 }
      )
    }
    if (String(url).endsWith("/constant")) return Response.json({ n: 1 })
    n += 1
    return Response.json({ n })
  })
  const counterQuery = (path: string, ctx: DomainContext) => ({
    key: ["counter", path],
    fetcher: ({ signal }: { signal: AbortSignal }) =>
      ctx.api.get<Counter>(path, { signal }),
    ...(options.interval ? { refetchInterval: options.interval } : {}),
    retry: 0,
  })
  const views = {
    "test.counter": defineView({
      queries: (p: { path: string }, ctx) => ({
        counter: counterQuery(p.path, ctx),
      }),
      compute: ({ counter }) => ({ label: `count ${counter.n}` }),
    }),
    "test.broken": defineView({
      queries: (_p: unknown, ctx) => ({ c: counterQuery("/x", ctx) }),
      compute: () => {
        throw new Error("compute failed")
      },
    }),
  }
  const actions = {
    "test.double": defineAction(async (input: number) => input * 2),
    "test.forbidden": defineAction((_: unknown, ctx) => ctx.api.get("/fail")),
  }
  const posts: ToMain[] = []
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch,
    views,
    actions,
  })
  const send = (m: ToWorker) => kernel.handle(m)
  const viewPushes = () =>
    posts.flatMap((p) =>
      p.kind === "push" && p.topic === "view" ? [p.data] : []
    )
  const replies = () => posts.filter((p) => p.kind === "reply")
  return { kernel, fetch, posts, send, viewPushes, replies }
}

const subscribe = (subId: string, view: string, params: unknown): ToWorker => ({
  kind: "command",
  name: "view.subscribe",
  args: { subId, view, params },
})

const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe("WorkerKernel views", () => {
  it("announces ready, then pushes loading → success view models", async () => {
    const t = setup()
    expect(t.posts[0]).toEqual({ kind: "push", topic: "ready", data: {} })
    t.send(subscribe("s1", "test.counter", { path: "/c" }))
    await flush()
    const pushes = t.viewPushes()
    expect(pushes[0]?.state.status).toBe("loading")
    expect(pushes.at(-1)).toMatchObject({
      subId: "s1",
      state: {
        status: "success",
        data: { label: "count 1" },
        isFetching: false,
      },
    })
  })

  it("marks data unchanged when a refetch returns the same view model", async () => {
    const t = setup({ interval: 1000 })
    t.send(subscribe("s1", "test.counter", { path: "/constant" }))
    await flush()
    const before = t.viewPushes().length
    await vi.advanceTimersByTimeAsync(1000)
    const after = t.viewPushes().slice(before)
    expect(t.fetch).toHaveBeenCalledTimes(2)
    expect(after.length).toBeGreaterThan(0)
    for (const push of after) {
      expect(push.dataUnchanged).toBe(true)
      expect(push.state.data).toBeUndefined()
    }
  })

  it("stops polling after unsubscribe", async () => {
    const t = setup({ interval: 1000 })
    t.send(subscribe("s1", "test.counter", { path: "/c" }))
    await flush()
    t.send({ kind: "command", name: "view.unsubscribe", args: { subId: "s1" } })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(t.fetch).toHaveBeenCalledTimes(1)
  })

  it("shares one query between two subscriptions with equal params", async () => {
    const t = setup()
    t.send(subscribe("a", "test.counter", { path: "/c" }))
    t.send(subscribe("b", "test.counter", { path: "/c" }))
    await flush()
    expect(t.fetch).toHaveBeenCalledTimes(1)
    const last = (id: string) => t.viewPushes().findLast((p) => p.subId === id)
    expect(last("a")?.state.data).toEqual({ label: "count 1" })
    expect(last("b")?.state.data).toEqual({ label: "count 1" })
  })

  it("reports an unknown view as BAD_REQUEST", async () => {
    const t = setup()
    t.send(subscribe("s1", "nope", {}))
    expect(t.viewPushes()[0]?.state.error?.code).toBe("BAD_REQUEST")
  })

  it("surfaces HTTP errors and compute errors as view errors", async () => {
    const t = setup()
    t.send(subscribe("s1", "test.counter", { path: "/fail" }))
    t.send(subscribe("s2", "test.broken", {}))
    await flush()
    const last = (id: string) => t.viewPushes().findLast((p) => p.subId === id)
    expect(last("s1")?.state).toMatchObject({
      status: "error",
      error: { code: "HTTP_403", message: "Not allowed" },
    })
    expect(last("s2")?.state).toMatchObject({
      status: "error",
      error: { code: "FAILED", message: "compute failed" },
    })
  })

  it("reset clears the cache and refetches active views", async () => {
    const t = setup()
    t.send(subscribe("s1", "test.counter", { path: "/c" }))
    await flush()
    t.send({ kind: "command", name: "reset", args: {} })
    await flush()
    expect(t.fetch).toHaveBeenCalledTimes(2)
    expect(t.viewPushes().at(-1)?.state.data).toEqual({ label: "count 2" })
  })

  it("prefetch warms the cache without pushing", async () => {
    const t = setup()
    t.send({
      kind: "command",
      name: "view.prefetch",
      args: { view: "test.counter", params: { path: "/c" } },
    })
    await flush()
    expect(t.fetch).toHaveBeenCalledTimes(1)
    expect(t.viewPushes()).toHaveLength(0)
  })

  it("session expiry is pushed on 401", async () => {
    const posts: ToMain[] = []
    const kernel = createKernel({
      post: (m) => posts.push(m),
      fetch: async () => Response.json({}, { status: 401 }),
      actions: {
        "a.me": defineAction((_: unknown, ctx) => ctx.api.get("/auth/me")),
      },
      views: {},
    })
    kernel.handle({
      kind: "rpc",
      id: 1,
      method: "action",
      args: { action: "a.me", input: null },
    })
    await flush()
    expect(
      posts.some((p) => p.kind === "push" && p.topic === "session.expired")
    ).toBe(true)
  })
})

describe("WorkerKernel actions", () => {
  it("replies ok with the action result", async () => {
    const t = setup()
    t.send({
      kind: "rpc",
      id: 7,
      method: "action",
      args: { action: "test.double", input: 21 },
    })
    await flush()
    expect(t.replies()).toEqual([{ kind: "reply", id: 7, ok: true, data: 42 }])
  })

  it("maps API errors to HTTP_<status>", async () => {
    const t = setup()
    t.send({
      kind: "rpc",
      id: 8,
      method: "action",
      args: { action: "test.forbidden", input: null },
    })
    await flush()
    expect(t.replies()[0]).toMatchObject({
      ok: false,
      error: { code: "HTTP_403" },
    })
  })

  it("rejects unknown actions and malformed rpcs with BAD_REQUEST", async () => {
    const t = setup()
    t.send({
      kind: "rpc",
      id: 9,
      method: "action",
      args: { action: "nope", input: null },
    })
    t.kernel.handle({ kind: "rpc", id: 10, method: "bogus", args: {} })
    await flush()
    expect(t.replies().map((r) => (r.ok ? null : r.error.code))).toEqual([
      "BAD_REQUEST",
      "BAD_REQUEST",
    ])
  })
})

describe("toProtocolError", () => {
  it("normalizes unknown errors", () => {
    expect(toProtocolError("boom")).toEqual({
      code: "FAILED",
      message: "Something went wrong",
    })
    const abort = Object.assign(new Error("x"), { name: "AbortError" })
    expect(toProtocolError(abort).message).toBe("The request was cancelled")
  })
})
