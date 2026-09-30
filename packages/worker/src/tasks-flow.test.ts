import type { TaskDetailVM, TaskDraft, ToMain } from "@app/protocol"
import { describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

/** Records every request; the task endpoints follow api/openapi.yaml. */
function fakeApi() {
  const requests: {
    method: string
    path: string
    body: unknown
    ifMatch: string | null
  }[] = []
  let task = {
    id: "t1",
    title: "Ship",
    description: null as string | null,
    status: "TODO",
    priority: "NONE",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
    dueDate: null as string | null,
    assignees: [] as { id: string; name: string; image: null }[],
    owners: [] as { id: string; name: string; image: null }[],
    labels: [] as unknown[],
    createdBy: { id: "u1", name: "Ada", image: null },
    createdAt: "2026-09-30T10:00:00Z",
    updatedAt: "2026-09-30T10:00:00Z",
    version: 1,
    viewer: {
      canManage: true,
      canManageOwners: true,
      isAssignee: false,
      canRequest: false,
    },
    client: null,
    parent: null,
    subtasks: [],
    checklist: [],
    comments: [],
    attachments: [],
    requests: [],
  }
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    const headers = new Headers(init?.headers)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, path, body, ifMatch: headers.get("If-Match") })
    if (path === "/workspaces/current/members") {
      return json({
        members: [
          {
            id: "u2",
            name: "Grace",
            email: "g@x",
            image: null,
            role: "MEMBER",
            joinedAt: "2026-09-01T00:00:00Z",
          },
        ],
      })
    }
    if (path === "/auth/me")
      return json({
        user: { id: "u1", name: "Ada", email: "a@x", image: null },
      })
    if (path === "/workspaces") return json({ workspaces: [], active: null })
    if (path === "/labels") return json({ labels: [] })
    if (path === "/clients") return json({ clients: [] })
    if (path === "/tasks/t1" && method === "GET") return json({ task })
    if (path === "/tasks/t1" && method === "PATCH") {
      if (headers.get("If-Match") !== `"${task.version}"`) {
        return json(
          {
            type: "conflict",
            title: "Conflict",
            status: 409,
            detail:
              "Someone else changed this task. Reload to see the latest version.",
          },
          409
        )
      }
      task = { ...task, ...body, version: task.version + 1 }
      return json({ task })
    }
    if (path === "/tasks/t1/assignees" && method === "PUT") {
      task = {
        ...task,
        assignees: body.userIds.map((id: string) => ({
          id,
          name: "Grace",
          image: null,
        })),
        version: task.version + 1,
      }
      return json({ task })
    }
    if (path.startsWith("/tasks") && method === "GET")
      return json({ tasks: [] })
    return json({ type: "x", title: "x", status: 404, detail: "nope" }, 404)
  })
  return {
    fetch,
    requests,
    bump: () => {
      task = { ...task, version: task.version + 1 }
    },
  }
}

async function setup() {
  const api = fakeApi()
  const posts: ToMain[] = []
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch: api.fetch,
    locale: "en-GB",
  })
  const settle = async (n = 4) => {
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
    for (let i = 0; i < 50; i++) {
      await settle(1)
      const reply = posts.find((p) => p.kind === "reply" && p.id === rpc)
      if (reply?.kind === "reply") return reply
    }
    throw new Error("no reply")
  }
  kernel.handle({
    kind: "command",
    name: "view.subscribe",
    args: { subId: "d", view: "tasks.detail", params: { taskId: "t1" } },
  })
  await settle()
  const detail = () => {
    const p = posts.findLast(
      (m) =>
        m.kind === "push" &&
        m.topic === "view" &&
        m.data.subId === "d" &&
        m.data.state.data
    )
    return (
      p?.kind === "push" && p.topic === "view" ? p.data.state.data : undefined
    ) as TaskDetailVM | undefined
  }
  return { api, run, detail, settle }
}

describe("tasks.save through the kernel", () => {
  it("sends only changed fields with If-Match, and skips unchanged sets", async () => {
    const t = await setup()
    const saved = t.detail()?.saved as TaskDraft
    expect(saved.title).toBe("Ship")
    t.api.requests.length = 0

    const reply = await t.run("tasks.save", {
      taskId: "t1",
      draft: { ...saved, title: "Ship v2", priority: "HIGH" },
    })
    expect(reply).toMatchObject({
      ok: true,
      data: { changed: true, version: 2 },
    })
    const writes = t.api.requests.filter((r) => r.method !== "GET")
    expect(writes).toEqual([
      {
        method: "PATCH",
        path: "/tasks/t1",
        body: { title: "Ship v2", priority: "HIGH" },
        ifMatch: '"1"',
      },
    ])
    await t.settle()
    expect(t.detail()?.title).toBe("Ship v2")
  })

  it("replaces a set only when it changed, and reports no-op saves", async () => {
    const t = await setup()
    const saved = t.detail()?.saved as TaskDraft
    t.api.requests.length = 0
    expect(
      await t.run("tasks.save", { taskId: "t1", draft: saved })
    ).toMatchObject({ ok: true, data: { changed: false } })
    expect(t.api.requests.filter((r) => r.method !== "GET")).toEqual([])

    await t.run("tasks.save", {
      taskId: "t1",
      draft: { ...saved, assigneeIds: ["u2"] },
    })
    expect(
      t.api.requests
        .filter((r) => r.method !== "GET")
        .map((r) => `${r.method} ${r.path}`)
    ).toEqual(["PUT /tasks/t1/assignees"])
  })

  it("surfaces a stale version as HTTP_409 and validates before sending", async () => {
    const t = await setup()
    const saved = t.detail()?.saved as TaskDraft
    t.api.bump() // someone else saved
    expect(
      await t.run("tasks.save", {
        taskId: "t1",
        draft: { ...saved, title: "Mine" },
      })
    ).toMatchObject({
      ok: false,
      error: {
        code: "HTTP_409",
        message:
          "Someone else changed this task. Reload to see the latest version.",
      },
    })
    t.api.requests.length = 0
    expect(
      await t.run("tasks.save", {
        taskId: "t1",
        draft: { ...saved, title: "" },
      })
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION", fieldErrors: [{ field: "title" }] },
    })
    expect(t.api.requests.filter((r) => r.method !== "GET")).toEqual([])
  })
})
