import type { SessionVM, ToMain, ToWorker } from "@app/protocol"
import { describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

/** An in-memory stand-in for the API's auth + workspace endpoints. */
function fakeApi() {
  const state = {
    signedIn: true,
    workspaces: [] as { id: string; name: string; role: "OWNER" | "MEMBER" }[],
    active: null as string | null,
    invite: "code-1",
  }
  const calls: string[] = []
  const json = (body: unknown, status = 200) => Response.json(body, { status })
  const problem = (status: number, detail: string) =>
    json({ type: "x", title: "x", status, detail }, status)

  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    calls.push(`${method} ${path}`)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (!state.signedIn) return problem(401, "sign in required")
    const activeWs = state.workspaces.find((w) => w.id === state.active)
    switch (`${method} ${path}`) {
      case "GET /auth/me":
        return json({
          user: { id: "u1", name: "Ada", email: "a@x.io", image: null },
        })
      case "GET /workspaces":
        return json({
          workspaces: state.workspaces,
          active: activeWs ? { ...activeWs, inviteCode: state.invite } : null,
        })
      case "POST /workspaces": {
        const ws = {
          id: `w${state.workspaces.length + 1}`,
          name: body.name,
          role: "OWNER" as const,
        }
        state.workspaces.push(ws)
        state.active = ws.id
        return json({ workspace: ws }, 201)
      }
      case "POST /workspaces/join":
        return body.inviteCode === "good"
          ? json({ workspace: { id: "wj", name: "Joined", role: "MEMBER" } })
          : problem(404, "That invite code isn't valid.")
      case "POST /workspaces/current/invite-code/rotate":
        state.invite = "code-2"
        return json({ inviteCode: "code-2" })
      case "POST /auth/logout":
        state.signedIn = false
        return new Response(null, { status: 204 })
      default:
        return problem(404, "no route")
    }
  })
  return { fetch, state, calls }
}

function setup() {
  const api = fakeApi()
  const posts: ToMain[] = []
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch: api.fetch,
    locale: "en",
  })
  const send = (m: ToWorker) => kernel.handle(m)
  const settle = () => new Promise((r) => setTimeout(r, 0))
  const session = (): SessionVM | undefined => {
    for (let i = posts.length - 1; i >= 0; i--) {
      const p = posts[i]
      if (
        p?.kind === "push" &&
        p.topic === "view" &&
        p.data.subId === "s" &&
        p.data.state.data
      ) {
        return p.data.state.data as SessionVM
      }
    }
    return undefined
  }
  let rpcId = 0
  const run = async (action: string, input: unknown) => {
    const id = ++rpcId
    send({ kind: "rpc", id, method: "action", args: { action, input } })
    for (let i = 0; i < 50; i++) {
      await settle()
      const reply = posts.find((p) => p.kind === "reply" && p.id === id)
      if (reply?.kind === "reply") return reply
    }
    throw new Error("no reply")
  }
  send({
    kind: "command",
    name: "view.subscribe",
    args: { subId: "s", view: "session.current", params: {} },
  })
  return { api, posts, send, settle, session, run }
}

describe("session + workspace actions through the kernel", () => {
  it("goes needsWorkspace → ready after create, then anonymous after logout", async () => {
    const t = setup()
    await t.settle()
    await t.settle()
    expect(t.session()?.status).toBe("needsWorkspace")

    const invalid = await t.run("workspaces.create", { name: "  " })
    expect(invalid).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: [{ field: "name" }] },
    })
    expect(t.api.calls).not.toContain("POST /workspaces")

    const created = await t.run("workspaces.create", { name: "  Acme " })
    expect(created).toMatchObject({
      ok: true,
      data: { id: "w1", name: "Acme" },
    })
    await t.settle()
    await t.settle()
    expect(t.session()).toMatchObject({
      status: "ready",
      activeWorkspace: { name: "Acme", isOwner: true, inviteCode: "code-1" },
    })

    const rotated = await t.run("workspaces.rotateInvite", {})
    expect(rotated).toMatchObject({ ok: true, data: { inviteCode: "code-2" } })
    await t.settle()
    expect(t.session()?.activeWorkspace?.inviteCode).toBe("code-2")

    await t.run("auth.logout", {})
    await t.settle()
    await t.settle()
    expect(t.session()?.status).toBe("anonymous")
    expect(
      t.posts.some((p) => p.kind === "push" && p.topic === "session.expired")
    ).toBe(false)
  })

  it("surfaces the server's message for a bad invite code", async () => {
    const t = setup()
    await t.settle()
    expect(await t.run("workspaces.join", { inviteCode: "bad" })).toMatchObject(
      {
        ok: false,
        error: { code: "HTTP_404", message: "That invite code isn't valid." },
      }
    )
    expect(await t.run("workspaces.join", { inviteCode: "" })).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    })
  })

  it("an unexpected 401 raises session.expired and the session turns anonymous", async () => {
    const t = setup()
    await t.settle()
    await t.settle()
    t.api.state.signedIn = false
    await t.run("workspaces.switch", { workspaceId: "w1" })
    await t.settle()
    await t.settle()
    expect(
      t.posts.some((p) => p.kind === "push" && p.topic === "session.expired")
    ).toBe(true)
    expect(t.session()?.status).toBe("anonymous")
  })
})
