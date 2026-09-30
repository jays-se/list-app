import type { ClientDetailVM, ClientsVM, LabelsVM, ToMain } from "@app/protocol"
import { describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

function fakeApi(role: "OWNER" | "MEMBER" = "OWNER") {
  const requests: { method: string; path: string; body: unknown }[] = []
  let clients = [
    {
      id: "c1",
      name: "Globex",
      email: null,
      phone: null,
      color: "teal",
      notes: null,
      taskCount: 1,
    },
  ]
  let labels = [{ id: "l1", name: "Bug", color: "red" }]
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, path, body })
    switch (`${method} ${path}`) {
      case "GET /auth/me":
        return json({
          user: { id: "u1", name: "Ada", email: "a@x", image: null },
        })
      case "GET /workspaces":
        return json({
          workspaces: [{ id: "w1", name: "W", role }],
          active: { id: "w1", name: "W", role, inviteCode: "c" },
        })
      case "GET /clients":
        return json({ clients })
      case "GET /clients/c1":
        return clients.length
          ? json({ client: clients[0] })
          : json(
              {
                type: "x",
                title: "x",
                status: 404,
                detail: "Client not found.",
              },
              404
            )
      case "POST /clients": {
        const c = { id: "c2", taskCount: 0, ...body }
        clients = [...clients, c]
        return json({ client: c }, 201)
      }
      case "PUT /clients/c1":
        clients = clients.map((c) => (c.id === "c1" ? { ...c, ...body } : c))
        return json({ client: clients[0] })
      case "DELETE /clients/c1":
        clients = []
        return new Response(null, { status: 204 })
      case "GET /labels":
        return json({ labels })
      case "POST /labels": {
        const l = { id: "l2", ...body }
        labels = [...labels, l]
        return json({ label: l }, 201)
      }
      case "DELETE /labels/l1":
        labels = labels.filter((l) => l.id !== "l1")
        return new Response(null, { status: 204 })
      default:
        if (path.startsWith("/tasks")) {
          return json({
            tasks: [
              {
                id: "t1",
                title: "Kickoff",
                status: "TODO",
                priority: "NONE",
                startDate: "2026-10-01",
                endDate: "2026-10-01",
                dueDate: null,
                assignees: [],
                labels: [],
                createdBy: { id: "u1", name: "Ada", image: null },
                version: 1,
                updatedAt: "2026-09-30T00:00:00Z",
                client: { id: "c1", name: "Globex", color: "teal" },
                parent: null,
                counts: {
                  subtasks: 0,
                  subtasksDone: 0,
                  checklist: 0,
                  checklistDone: 0,
                  comments: 0,
                  attachments: 0,
                  pendingRequests: 0,
                },
              },
            ],
          })
        }
        return json({ type: "x", title: "x", status: 404, detail: "nope" }, 404)
    }
  })
  return { fetch, requests }
}

async function setup(role?: "OWNER" | "MEMBER") {
  const api = fakeApi(role)
  const posts: ToMain[] = []
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch: api.fetch,
    locale: "en-GB",
  })
  const settle = async (n = 6) => {
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
    for (let i = 0; i < 100; i++) {
      await settle(1)
      const reply = posts.find((p) => p.kind === "reply" && p.id === rpc)
      if (reply?.kind === "reply") return reply
    }
    throw new Error("no reply")
  }
  const subscribe = async (subId: string, view: string, params: unknown) => {
    kernel.handle({
      kind: "command",
      name: "view.subscribe",
      args: { subId, view, params },
    })
    await settle()
  }
  const latest = (subId: string) => {
    for (let i = posts.length - 1; i >= 0; i--) {
      const p = posts[i]
      if (p?.kind === "push" && p.topic === "view" && p.data.subId === subId)
        return p.data.state
    }
    return undefined
  }
  const data = <T>(subId: string) => latest(subId)?.data as T | undefined
  return { api, run, subscribe, data, latest, settle }
}

const draft = {
  name: "Initech",
  email: "hi@initech.test",
  phone: "",
  color: "blue" as const,
  notes: "",
}

describe("clients through the kernel", () => {
  it("lists, creates, updates and deletes", async () => {
    const t = await setup()
    await t.subscribe("list", "clients.list", {})
    expect(t.data<ClientsVM>("list")).toMatchObject({
      canDelete: true,
      clients: [{ name: "Globex", taskCountText: "1 task" }],
    })

    expect(
      await t.run("clients.create", { ...draft, name: " " })
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
    expect(await t.run("clients.create", draft)).toMatchObject({
      ok: true,
      data: { id: "c2" },
    })
    expect(t.api.requests.find((r) => r.method === "POST")?.body).toEqual({
      name: "Initech",
      email: "hi@initech.test",
      phone: null,
      color: "blue",
      notes: null,
    })
    await t.settle()
    expect(t.data<ClientsVM>("list")?.clients.map((c) => c.name)).toEqual([
      "Globex",
      "Initech",
    ])

    await t.subscribe("detail", "clients.detail", { clientId: "c1" })
    expect(t.data<ClientDetailVM>("detail")).toMatchObject({
      tasksText: "1 linked task",
      saved: { name: "Globex", email: "" },
    })
    expect(
      await t.run("clients.update", {
        clientId: "c1",
        draft: { ...draft, name: "Globex Corp" },
      })
    ).toMatchObject({ ok: true })
    expect(
      await t.run("clients.update", {
        clientId: "c1",
        draft: { ...draft, email: "bad" },
      })
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
    expect(await t.run("clients.delete", { clientId: "c1" })).toMatchObject({
      ok: true,
    })
  })

  it("members can't delete", async () => {
    const t = await setup("MEMBER")
    await t.subscribe("list", "clients.list", {})
    expect(t.data<ClientsVM>("list")?.canDelete).toBe(false)
  })
})

describe("labels through the kernel", () => {
  it("creates (validated) and deletes, owner-only delete flag", async () => {
    const t = await setup()
    await t.subscribe("labels", "labels.list", {})
    expect(t.data<LabelsVM>("labels")).toMatchObject({
      canDelete: true,
      labels: [{ name: "Bug", canDelete: true }],
    })
    expect(
      await t.run("labels.create", { name: "", color: "red" })
    ).toMatchObject({ ok: false, error: { code: "VALIDATION" } })
    expect(
      await t.run("labels.create", { name: " Docs ", color: "blue" })
    ).toMatchObject({ ok: true, data: { id: "l2", name: "Docs" } })
    expect(await t.run("labels.delete", { labelId: "l1" })).toMatchObject({
      ok: true,
    })
    await t.settle()
    expect(t.data<LabelsVM>("labels")?.labels.map((l) => l.name)).toEqual([
      "Docs",
    ])
  })
})
