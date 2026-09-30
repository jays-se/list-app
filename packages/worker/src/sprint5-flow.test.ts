import type { ToMain } from "@app/protocol"
import { describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

type Handler = (
  method: string,
  path: string,
  body: unknown,
  headers: Headers
) => Response | undefined

function harness(handler: Handler) {
  const calls: {
    method: string
    path: string
    body: unknown
    headers: Headers
  }[] = []
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    const headers = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body, headers })
    return (
      handler(method, path, body, headers) ??
      (path === "/auth/me"
        ? json({ user: { id: "u1", name: "Ada", email: "a@x", image: null } })
        : path === "/workspaces"
          ? json({ workspaces: [], active: null })
          : json({ type: "x", title: "x", status: 404, detail: "nope" }, 404))
    )
  })
  const clock = Date.parse("2026-10-07T09:00:00Z")
  const posts: ToMain[] = []
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch,
    locale: "en-GB",
    now: () => clock,
  })
  const settle = async (n = 8) => {
    for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0))
  }
  let id = 0
  const run = async (action: string, input: unknown) => {
    const rpc = ++id
    kernel.handle({
      kind: "rpc",
      id: rpc,
      method: "action",
      args: { action, input },
    })
    for (let i = 0; i < 200; i++) {
      await settle(1)
      const reply = posts.find((p) => p.kind === "reply" && p.id === rpc)
      if (reply?.kind === "reply") return reply
    }
    throw new Error("no reply")
  }
  return { calls, run, kernel, settle }
}

const problem = (status: number, extra: Record<string, unknown> = {}) =>
  Response.json(
    { type: "x", title: "x", status, detail: "Failed", ...extra },
    { status }
  )

describe("quick capture through the kernel", () => {
  it("parses, validates, creates once per content, and maps line errors", async () => {
    let fail: Response | undefined
    const t = harness((method, path) => {
      if (method === "POST" && path === "/tasks/bulk")
        return fail ?? Response.json({ tasks: [] }, { status: 201 })
      return undefined
    })
    const parsed = await t.run("capture.parse", {
      text: "- Call vendor\n\n2) Send deck\n",
    })
    expect(parsed).toMatchObject({
      ok: true,
      data: { summaryText: "2 tasks · 1 empty line skipped", warning: null },
    })
    const data = (
      parsed as {
        data: { batchId: string; lines: { id: string; text: string }[] }
      }
    ).data
    expect(data.lines.map((l) => l.text)).toEqual(["Call vendor", "Send deck"])

    expect(
      await t.run("capture.create", {
        batchId: data.batchId,
        source: "PERSONAL",
        lines: [{ id: "x", text: " " }],
      })
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: [{ field: "x" }] },
    })
    expect(
      await t.run("capture.create", {
        batchId: data.batchId,
        source: "PERSONAL",
        lines: [],
      })
    ).toMatchObject({ ok: false, error: { fieldErrors: [{ field: "lines" }] } })

    const ok = await t.run("capture.create", {
      batchId: data.batchId,
      source: "PERSONAL",
      lines: data.lines,
    })
    expect(ok).toMatchObject({ ok: true, data: { created: 2 } })
    const bulk = t.calls.filter((c) => c.path === "/tasks/bulk")
    expect(bulk[0]?.body).toEqual({
      source: "PERSONAL",
      startDate: "2026-10-07",
      endDate: "2026-10-07",
      titles: ["Call vendor", "Send deck"],
    })
    const key = bulk[0]?.headers.get("Idempotency-Key") ?? ""
    expect(key.startsWith(data.batchId)).toBe(true)

    // A retry of the same content reuses the key; edited content doesn't.
    await t.run("capture.create", {
      batchId: data.batchId,
      source: "PERSONAL",
      lines: data.lines,
    })
    const edited = [
      { ...data.lines[0], text: "Call vendor today" },
      data.lines[1],
    ]
    fail = problem(422, {
      errors: [{ field: "titles[1]", message: "Line 2: Title is required" }],
    })
    const bad = await t.run("capture.create", {
      batchId: data.batchId,
      source: "PERSONAL",
      lines: edited,
    })
    expect(bad).toMatchObject({
      ok: false,
      error: {
        code: "VALIDATION",
        fieldErrors: [
          { field: data.lines[1]?.id, message: "Line 2: Title is required" },
        ],
      },
    })
    const keys = t.calls
      .filter((c) => c.path === "/tasks/bulk")
      .map((c) => c.headers.get("Idempotency-Key"))
    expect(keys[1]).toBe(keys[0])
    expect(keys[2]).not.toBe(keys[0])

    fail = problem(500)
    expect(
      await t.run("capture.create", {
        batchId: data.batchId,
        source: "PERSONAL",
        lines: data.lines,
      })
    ).toMatchObject({ ok: false, error: { code: "HTTP_500" } })
  })

  it("keeps at most 100 lines and says so", async () => {
    const t = harness(() => undefined)
    const text = Array.from({ length: 105 }, (_, i) => `Line ${i}`).join("\n")
    expect(await t.run("capture.parse", { text })).toMatchObject({
      ok: true,
      data: {
        warning: "Only the first 100 lines are kept (105 pasted).",
        summaryText: "100 tasks",
      },
    })
  })
})

describe("member lifecycle through the kernel", () => {
  it("leaves, removes and changes roles", async () => {
    const t = harness((method, path) => {
      if (method === "POST" && path === "/workspaces/current/leave")
        return new Response(null, { status: 204 })
      if (method === "DELETE" && path === "/workspaces/current/members/u2")
        return new Response(null, { status: 204 })
      if (method === "PATCH" && path === "/workspaces/current/members/u2")
        return Response.json({ member: {} })
      if (method === "PATCH" && path === "/workspaces/current/members/u1")
        return problem(409, {
          type: "last_owner",
          detail: "You're the only owner.",
        })
      return undefined
    })
    expect(await t.run("members.remove", { userId: "u2" })).toMatchObject({
      ok: true,
    })
    expect(
      await t.run("members.setRole", { userId: "u2", role: "OWNER" })
    ).toMatchObject({ ok: true })
    expect(t.calls.find((c) => c.method === "PATCH")?.body).toEqual({
      role: "OWNER",
    })
    expect(
      await t.run("members.setRole", { userId: "u1", role: "MEMBER" })
    ).toMatchObject({
      ok: false,
      error: { code: "HTTP_409", message: "You're the only owner." },
    })
    expect(await t.run("workspaces.leave", {})).toMatchObject({ ok: true })
  })

  it("resets tenant data only when the active workspace changed", async () => {
    let active: { id: string } | null = {
      id: "w1",
      name: "Crew",
      role: "MEMBER",
      inviteCode: "c",
    } as never
    const t = harness((_m, path) => {
      if (path === "/workspaces")
        return Response.json({ workspaces: active ? [active] : [], active })
      if (path.startsWith("/tasks"))
        return problem(409, { type: "no_active_workspace" })
      return undefined
    })
    const reset = vi.spyOn(t.kernel, "reset")
    t.kernel.handle({
      kind: "command",
      name: "view.subscribe",
      args: { subId: "s", view: "session.current", params: {} },
    })
    await t.settle()
    // A 409 while the session still names the same workspace: no reset.
    t.kernel.handle({
      kind: "command",
      name: "view.prefetch",
      args: { view: "tasks.list", params: {} },
    })
    await t.settle(20)
    expect(reset).not.toHaveBeenCalled()
    // Removed: the session now has no active workspace → one reset.
    active = null
    for (const params of [{ mine: "true" }, { status: "DONE" }]) {
      t.kernel.handle({
        kind: "command",
        name: "view.prefetch",
        args: { view: "tasks.list", params },
      })
      await t.settle(20)
    }
    expect(reset).toHaveBeenCalledTimes(1)
  })
})
