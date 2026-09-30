import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { QueryClient } from "./client.ts"
import { matchKey } from "./key.ts"
import type { FetchContext, QuerySnapshot } from "./types.ts"

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

function httpError(status: number) {
  return Object.assign(new Error(`HTTP ${status}`), { status })
}

/** Fetcher that rejects with AbortError when its signal aborts. */
function abortable<T>(value: Promise<T>) {
  return ({ signal }: FetchContext) =>
    new Promise<T>((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason))
      value.then(resolve, reject)
    })
}

const flush = () => vi.advanceTimersByTimeAsync(0)

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe("matchKey", () => {
  it("matches prefixes structurally", () => {
    expect(matchKey(["tasks"], ["tasks", { status: "TODO" }])).toBe(true)
    expect(matchKey(["tasks", { a: 1, b: 2 }], ["tasks", { b: 2, a: 1 }])).toBe(
      true
    )
    expect(matchKey(["tasks", "x"], ["tasks"])).toBe(false)
    expect(matchKey(["docs"], ["tasks"])).toBe(false)
  })
})

describe("fetching and dedupe", () => {
  it("deduplicates concurrent fetches", async () => {
    const client = new QueryClient()
    const fetcher = vi.fn(async () => "data")
    const [a, b] = await Promise.all([
      client.fetchQuery({ key: ["k"], fetcher }),
      client.fetchQuery({ key: ["k"], fetcher }),
    ])
    expect(a).toBe("data")
    expect(b).toBe("data")
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("serves fresh data within ttl and refetches once stale", async () => {
    const client = new QueryClient({ ttl: 1000 })
    let n = 0
    const fetcher = vi.fn(async () => ++n)
    expect(await client.fetchQuery({ key: ["k"], fetcher })).toBe(1)
    vi.advanceTimersByTime(999)
    expect(await client.fetchQuery({ key: ["k"], fetcher })).toBe(1)
    vi.advanceTimersByTime(1)
    expect(await client.fetchQuery({ key: ["k"], fetcher })).toBe(2)
  })

  it("transitions loading → success with isFetching and updatedAt", async () => {
    const client = new QueryClient()
    const d = deferred<string>()
    const seen: QuerySnapshot<string>[] = []
    client.observe({ key: ["k"], fetcher: () => d.promise }, (s) =>
      seen.push(s)
    )
    expect(seen.at(-1)).toMatchObject({ status: "loading", isFetching: true })
    d.resolve("ok")
    await flush()
    expect(seen.at(-1)).toMatchObject({
      status: "success",
      data: "ok",
      isFetching: false,
    })
    expect(seen.at(-1)?.updatedAt).toBeGreaterThan(0)
  })

  it("keeps previous data when a refetch fails", async () => {
    const client = new QueryClient({ retry: 0 })
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("v1")
      .mockRejectedValueOnce(httpError(500))
    await client.fetchQuery({ key: ["k"], fetcher })
    await expect(client.query({ key: ["k"] }).fetch(true)).rejects.toThrow(
      "HTTP 500"
    )
    expect(client.getSnapshot(["k"])).toMatchObject({
      status: "error",
      data: "v1",
    })
  })
})

describe("retry", () => {
  it("retries 5xx with exponential backoff", async () => {
    const client = new QueryClient({ retry: 2 })
    const fetcher = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(httpError(503))
      .mockRejectedValueOnce(httpError(503))
      .mockResolvedValueOnce("ok")
    const result = client.fetchQuery({ key: ["k"], fetcher })
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(2000)
    await expect(result).resolves.toBe("ok")
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it("never retries 4xx", async () => {
    const client = new QueryClient({ retry: 3 })
    const fetcher = vi.fn(async () => {
      throw httpError(404)
    })
    await expect(client.fetchQuery({ key: ["k"], fetcher })).rejects.toThrow()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("gives up after the configured retries", async () => {
    const client = new QueryClient({ retry: 1, retryDelay: () => 10 })
    const fetcher = vi.fn(async () => {
      throw httpError(500)
    })
    const result = client.fetchQuery({ key: ["k"], fetcher })
    const assertion = expect(result).rejects.toThrow("HTTP 500")
    await vi.advanceTimersByTimeAsync(10)
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe("abort", () => {
  it("force-fetch aborts the in-flight request and dedupes callers onto the new one", async () => {
    const client = new QueryClient()
    const first = deferred<string>()
    const second = deferred<string>()
    const signals: AbortSignal[] = []
    const fetcher = vi.fn((ctx: FetchContext) => {
      signals.push(ctx.signal)
      return abortable(signals.length === 1 ? first.promise : second.promise)(
        ctx
      )
    })
    const query = client.query({ key: ["k"], fetcher })
    const early = query.fetch()
    const forced = query.fetch(true)
    expect(signals[0]?.aborted).toBe(true)
    second.resolve("fresh")
    await expect(forced).resolves.toBe("fresh")
    await expect(early).resolves.toBe("fresh")
    expect(client.getQueryData(["k"])).toBe("fresh")
  })

  it("clearAll aborts in-flight requests and empties the cache", async () => {
    const client = new QueryClient()
    let signal: AbortSignal | undefined
    const pending = client.fetchQuery({
      key: ["k"],
      fetcher: (ctx) => {
        signal = ctx.signal
        return abortable(new Promise<string>(() => {}))(ctx)
      },
    })
    client.clearAll()
    expect(signal?.aborted).toBe(true)
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(client.getSnapshot(["k"])).toBeUndefined()
  })

  it("does not retry after abort", async () => {
    const client = new QueryClient({ retry: 3 })
    const fetcher = vi.fn(async () => {
      throw httpError(500)
    })
    const pending = client.fetchQuery({ key: ["k"], fetcher })
    const assertion = expect(pending).rejects.toBeDefined()
    await flush()
    client.cancel(["k"])
    await vi.advanceTimersByTimeAsync(60_000)
    await assertion
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe("observe, polling, visibility, gc", () => {
  it("polls while observed and stops when unobserved", async () => {
    const client = new QueryClient()
    const fetcher = vi.fn(async () => "x")
    const off = client.observe(
      { key: ["k"], fetcher, refetchInterval: 15_000 },
      () => {}
    )
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(15_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
    off()
    await vi.advanceTimersByTimeAsync(60_000)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("pauses polling while hidden and catches up when visible", async () => {
    const client = new QueryClient()
    const fetcher = vi.fn(async () => "x")
    client.observe({ key: ["k"], fetcher, refetchInterval: 10_000 }, () => {})
    await flush()
    client.setVisible(false)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(fetcher).toHaveBeenCalledTimes(1)
    client.setVisible(true)
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("does not refetch fresh data on a new observer", async () => {
    const client = new QueryClient({ ttl: 60_000 })
    const fetcher = vi.fn(async () => "x")
    await client.fetchQuery({ key: ["k"], fetcher })
    client.observe({ key: ["k"], fetcher }, () => {})
    await flush()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("garbage-collects unobserved queries after gcTime", async () => {
    const client = new QueryClient({ gcTime: 1000 })
    const off = client.observe({ key: ["k"], fetcher: async () => 1 }, () => {})
    await flush()
    off()
    vi.advanceTimersByTime(999)
    expect(client.getSnapshot(["k"])).toBeDefined()
    vi.advanceTimersByTime(1)
    expect(client.getSnapshot(["k"])).toBeUndefined()
  })

  it("re-observing cancels pending gc", async () => {
    const client = new QueryClient({ gcTime: 1000 })
    const opts = { key: ["k"], fetcher: async () => 1 }
    client.observe(opts, () => {})()
    vi.advanceTimersByTime(500)
    client.observe(opts, () => {})
    vi.advanceTimersByTime(5000)
    expect(client.getSnapshot(["k"])).toBeDefined()
  })
})

describe("invalidation", () => {
  it("refetches observed queries matching the prefix", async () => {
    const client = new QueryClient({ ttl: Infinity })
    const tasks = vi.fn(async () => ["t"])
    const docs = vi.fn(async () => ["d"])
    client.observe(
      { key: ["tasks", { status: "TODO" }], fetcher: tasks },
      () => {}
    )
    client.observe({ key: ["docs"], fetcher: docs }, () => {})
    await flush()
    await client.invalidate(["tasks"])
    expect(tasks).toHaveBeenCalledTimes(2)
    expect(docs).toHaveBeenCalledTimes(1)
  })

  it("marks unobserved queries stale without fetching", async () => {
    const client = new QueryClient({ ttl: Infinity })
    const fetcher = vi.fn(async () => 1)
    await client.fetchQuery({ key: ["k"], fetcher })
    await client.invalidate(["k"])
    expect(fetcher).toHaveBeenCalledTimes(1)
    await client.fetchQuery({ key: ["k"], fetcher })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
})

describe("mutations", () => {
  it("applies an optimistic update and rolls back on failure", async () => {
    const client = new QueryClient({ ttl: Infinity })
    await client.fetchQuery({ key: ["todos"], fetcher: async () => ["a"] })
    const mutation = client.mutate(
      {
        onMutate: (title: string) =>
          client.optimistic<string[]>(["todos"], (old = []) => [...old, title]),
        mutationFn: async () => {
          throw httpError(500)
        },
        onError: (_e, _v, rollback) => rollback?.(),
      },
      "b"
    )
    expect(client.getQueryData(["todos"])).toEqual(["a", "b"])
    await expect(mutation).rejects.toThrow()
    expect(client.getQueryData(["todos"])).toEqual(["a"])
  })

  it("invalidates declared keys after success", async () => {
    const client = new QueryClient({ ttl: Infinity })
    const fetcher = vi.fn(async () => 1)
    client.observe({ key: ["tasks", 1], fetcher }, () => {})
    await flush()
    const onSuccess = vi.fn()
    const result = await client.mutate(
      {
        mutationFn: async (n: number) => n * 2,
        onSuccess,
        invalidates: (r) => [["tasks", r / 2]],
      },
      1
    )
    expect(result).toBe(2)
    expect(onSuccess).toHaveBeenCalledWith(2, 1, undefined)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("optimistic on an unknown key is removed on rollback", () => {
    const client = new QueryClient()
    const rollback = client.optimistic(["new"], 1)
    expect(client.getQueryData(["new"])).toBe(1)
    rollback()
    expect(client.getSnapshot(["new"])).toBeUndefined()
  })

  it("cancels in-flight fetches so they cannot overwrite optimistic data", async () => {
    const client = new QueryClient()
    const d = deferred<number>()
    const pending = client.fetchQuery({
      key: ["k"],
      fetcher: abortable(d.promise),
    })
    client.optimistic(["k"], 42)
    d.resolve(1)
    await expect(pending).rejects.toBeDefined()
    expect(client.getQueryData(["k"])).toBe(42)
  })
})
