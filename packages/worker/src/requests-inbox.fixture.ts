/** Fake API + kernel harness for requests-inbox-flow.test.ts. */
import type { ToMain } from "@app/protocol"
import { vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

const person = (id: string, name: string) => ({ id, name, image: null })

function makeTask() {
  return {
    id: "t1",
    title: "Ship",
    description: null,
    status: "TODO",
    priority: "NONE",
    startDate: "2026-10-01",
    endDate: "2026-10-05",
    dueDate: null as string | null,
    assignees: [person("u1", "Ada")],
    owners: [],
    labels: [],
    createdBy: person("u2", "Grace"),
    createdAt: "2026-09-30T10:00:00Z",
    updatedAt: "2026-09-30T10:00:00Z",
    version: 1,
    viewer: {
      canManage: false,
      canManageOwners: false,
      isAssignee: true,
      canRequest: true,
    },
    client: null,
    parent: null,
    subtasks: [],
    checklist: [{ id: "c1", title: "QA", done: false, assignee: null }],
    comments: [],
    attachments: [],
    requests: [] as unknown[],
  }
}

function notification(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    kind: "ASSIGNED",
    task: { id: "t1", title: "Ship" },
    taskTitle: "Ship",
    actor: person("u2", "Grace"),
    detail: "assigned you",
    commentBody: null,
    createdAt: "2026-09-30T10:00:00Z",
    readAt: null as string | null,
    ...over,
  }
}

export function fakeApi() {
  const calls: { method: string; path: string; body: unknown }[] = []
  const task = makeTask()
  let seq = 0
  let failNext = false
  let notes = [
    notification("n1"),
    notification("n2", {
      kind: "DUE",
      actor: null,
      detail: "is due tomorrow",
      task: null,
      taskTitle: "Renew",
    }),
    notification("n3", { readAt: "2026-09-30T11:00:00Z" }),
  ]
  let settings = [
    "MENTION",
    "ASSIGNED",
    "STATUS",
    "DUE",
    "REQUEST",
    "REVIEWED",
  ].map((kind) => ({ kind, enabled: true }))
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  const problem = (status: number, detail: string) =>
    json({ type: "x", title: "x", status, detail }, status)
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    calls.push({ method, path, body })
    if (failNext && method !== "GET") {
      failNext = false
      return problem(500, "boom")
    }
    const unread = () => notes.filter((n) => !n.readAt).length
    switch (`${method} ${path}`) {
      case "GET /auth/me":
        return json({
          user: { id: "u1", name: "Ada", email: "a@x", image: null },
        })
      case "GET /workspaces":
        return json({ workspaces: [], active: null })
      case "GET /workspaces/current/members":
        return json({
          members: ["u1:Ada", "u2:Grace", "u3:Linus"].map((m) => {
            const [id, name] = m.split(":")
            return {
              id,
              name,
              email: "x@x",
              image: null,
              role: "MEMBER",
              joinedAt: "2026-09-01T00:00:00Z",
            }
          }),
        })
      case "GET /labels":
        return json({ labels: [] })
      case "GET /clients":
        return json({ clients: [] })
      case "GET /tasks/t1":
        return json({ task })
      case "POST /tasks/t1/requests": {
        const summary =
          body.kind === "UPDATE"
            ? `Change ${body.payload.field}`
            : `${body.kind} ${body.payload.userId ?? body.payload.itemId ?? body.payload.title ?? ""}`
        task.requests.unshift({
          id: `r${++seq}`,
          kind: body.kind,
          status: "PENDING",
          payload: body.payload,
          summary,
          note: body.note,
          reviewNote: null,
          requester: person("u1", "Ada"),
          reviewer: null,
          createdAt: "2026-09-30T11:00:00Z",
          decidedAt: null,
        })
        return json({ task }, 201)
      }
      case "GET /notifications":
        return json({ notifications: notes, unread: unread() })
      case "GET /notifications?unread=true":
        return json({
          notifications: notes.filter((n) => !n.readAt),
          unread: unread(),
        })
      case "POST /notifications/read-all":
        notes = notes.map((n) => ({
          ...n,
          readAt: n.readAt ?? "2026-09-30T12:00:00Z",
        }))
        return new Response(null, { status: 204 })
      case "GET /notifications/settings":
        return json({ settings })
      case "PUT /notifications/settings":
        settings = settings.map(
          (s) =>
            body.settings.find((x: { kind: string }) => x.kind === s.kind) ?? s
        )
        return json({ settings })
    }
    const decide = path.match(/^\/requests\/(r\d+)\/(approve|reject|cancel)$/)
    if (decide && method === "POST") {
      const r = task.requests.find(
        (x) => (x as { id: string }).id === decide[1]
      ) as Record<string, unknown>
      r.status = {
        approve: "APPROVED",
        reject: "REJECTED",
        cancel: "CANCELED",
      }[decide[2] as "approve"]
      r.reviewer = decide[2] === "cancel" ? null : person("u2", "Grace")
      r.reviewNote = body?.note ?? null
      return json({ task })
    }
    const read = path.match(/^\/notifications\/(n\d+)\/read$/)
    if (read && method === "POST") {
      notes = notes.map((n) =>
        n.id === read[1] ? { ...n, readAt: "2026-09-30T12:00:00Z" } : n
      )
      return new Response(null, { status: 204 })
    }
    if (path.startsWith("/tasks")) return json({ tasks: [] })
    if (path.includes("/history")) return json({ events: [], stages: [] })
    return problem(404, "nope")
  })
  return {
    fetch,
    calls,
    task,
    failOnce: () => {
      failNext = true
    },
  }
}

export async function setup() {
  const api = fakeApi()
  const posts: ToMain[] = []
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch: api.fetch,
    locale: "en-GB",
    now: () => Date.parse("2026-09-30T12:00:00Z"),
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
  const subscribe = async (subId: string, view: string, params: unknown) => {
    kernel.handle({
      kind: "command",
      name: "view.subscribe",
      args: { subId, view, params },
    })
    await settle()
  }
  const data = <T>(subId: string): T | undefined => {
    let last: T | undefined
    for (const p of posts) {
      if (
        p.kind === "push" &&
        p.topic === "view" &&
        p.data.subId === subId &&
        !p.data.dataUnchanged
      )
        last = (p.data.state.data as T | undefined) ?? last
    }
    return last
  }
  return { api, run, subscribe, data, settle }
}
