import type { TaskDetailVM, ToMain, UploadProgress } from "@app/protocol"
import { describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

function fakeApi() {
  const requests: { method: string; path: string; body: unknown }[] = []
  let failChecklist = false
  const task = {
    id: "t1",
    title: "Ship",
    description: null,
    status: "TODO",
    priority: "NONE",
    startDate: "2026-10-01",
    endDate: "2026-10-02",
    dueDate: null,
    assignees: [],
    owners: [],
    labels: [],
    createdBy: { id: "u1", name: "Ada", image: null },
    createdAt: "2026-09-30T10:00:00Z",
    updatedAt: "2026-09-30T10:00:00Z",
    version: 1,
    viewer: { canManage: true, canManageOwners: true, isAssignee: false },
    client: null,
    parent: null,
    subtasks: [],
    checklist: [{ id: "c1", title: "Draft", done: false, assignee: null }],
    comments: [],
    attachments: [] as unknown[],
  }
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  let att = 0
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    requests.push({ method, path, body })
    if (path === "/workspaces/current/members") {
      return json({
        members: [
          {
            id: "u2",
            name: "Grace Hopper",
            email: "g@x",
            image: null,
            role: "MEMBER",
            joinedAt: "2026-09-01T00:00:00Z",
          },
        ],
      })
    }
    if (path === "/labels") return json({ labels: [] })
    if (path === "/clients") return json({ clients: [] })
    if (path === "/tasks/t1" && method === "GET") return json({ task })
    if (path === "/tasks/checklist/c1" && method === "PATCH") {
      if (failChecklist)
        return json({ type: "x", title: "x", status: 500, detail: "boom" }, 500)
      return json({ item: { ...task.checklist[0], ...body } })
    }
    if (path === "/tasks/t1/comments") return json({ comment: {} }, 201)
    if (path === "/tasks/t1/attachments") {
      att++
      return json(
        {
          attachment: {
            id: `a${att}`,
            filename: body.filename,
            mimeType: body.mimeType,
            size: body.size,
            uploadedBy: null,
            createdAt: "2026-09-30T10:00:00Z",
            downloadUrl: `/api/v1/attachments/a${att}`,
          },
          upload: {
            method: "PUT",
            url: `/api/v1/blobs/tok${att}`,
            headers: { "Content-Type": body.mimeType },
          },
        },
        201
      )
    }
    if (path.endsWith("/complete")) return json({ attachment: {} })
    return json({ tasks: [] })
  })
  return {
    fetch,
    requests,
    failNextChecklist: () => {
      failChecklist = true
    },
  }
}

async function setup() {
  const api = fakeApi()
  const posts: ToMain[] = []
  const uploads: string[] = []
  const upload = vi.fn(
    async (
      target: { url: string },
      _file: Blob,
      onProgress: (p: number) => void
    ) => {
      uploads.push(target.url)
      onProgress(50)
      onProgress(100)
    }
  )
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch: api.fetch,
    locale: "en-GB",
    upload,
  })
  const settle = async (n = 5) => {
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
  kernel.handle({
    kind: "command",
    name: "view.subscribe",
    args: { subId: "d", view: "tasks.detail", params: { taskId: "t1" } },
  })
  await settle()
  const details = () =>
    posts.flatMap((m) =>
      m.kind === "push" && m.topic === "view" && m.data.state.data
        ? [m.data.state.data as TaskDetailVM]
        : []
    )
  const progress = () =>
    posts.flatMap((m) =>
      m.kind === "push" && m.topic === "upload.progress"
        ? [m.data as UploadProgress]
        : []
    )
  return { api, run, details, progress, uploads, settle }
}

describe("collaboration actions through the kernel", () => {
  it("uploads files: checks size, reserves, PUTs with progress, completes", async () => {
    const t = await setup()
    const small = new File(["hello"], "notes.txt", { type: "text/plain" })
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.bin")
    const reply = await t.run("attachments.upload", {
      taskId: "t1",
      files: [small, big],
    })
    expect(reply).toMatchObject({
      ok: true,
      data: {
        uploaded: 1,
        failed: [
          { filename: "big.bin", message: "big.bin is larger than 5MB" },
        ],
      },
    })
    expect(t.uploads).toEqual(["/api/v1/blobs/tok1"])
    expect(
      t.api.requests.filter((r) => r.method === "POST").map((r) => r.path)
    ).toEqual(["/tasks/t1/attachments", "/attachments/a1/complete"])
    const states = t
      .progress()
      .map((p) => `${p.filename}:${p.state}:${p.percent}`)
    expect(states).toEqual([
      "notes.txt:uploading:0",
      "notes.txt:uploading:50",
      "notes.txt:uploading:100",
      "notes.txt:done:100",
      "big.bin:failed:0",
    ])
  })

  it("keeps only mentions still present in the comment", async () => {
    const t = await setup()
    await t.run("comments.add", {
      taskId: "t1",
      body: "  thanks @Grace Hopper ",
      mentionIds: ["u2", "u9"],
    })
    const post = t.api.requests.find((r) => r.path === "/tasks/t1/comments")
    expect(post?.body).toEqual({
      body: "thanks @Grace Hopper",
      mentionedUserIds: ["u2"],
    })
    await t.run("comments.add", {
      taskId: "t1",
      body: "removed the mention",
      mentionIds: ["u2"],
    })
    expect(
      t.api.requests.filter((r) => r.path === "/tasks/t1/comments")[1]?.body
    ).toEqual({
      body: "removed the mention",
      mentionedUserIds: [],
    })
    expect(
      await t.run("comments.add", { taskId: "t1", body: "  ", mentionIds: [] })
    ).toMatchObject({
      ok: false,
      error: { code: "VALIDATION" },
    })
  })

  it("toggles checklist items optimistically and rolls back on failure", async () => {
    const t = await setup()
    t.api.failNextChecklist()
    const before = t.details().length
    const reply = await t.run("checklist.update", {
      taskId: "t1",
      itemId: "c1",
      done: true,
    })
    expect(reply).toMatchObject({ ok: false, error: { code: "HTTP_500" } })
    const seen = t
      .details()
      .slice(before)
      .map((d) => d.checklist[0]?.done)
    expect(seen).toContain(true) // optimistic state was shown
    expect(seen.at(-1)).toBe(false) // then rolled back
  })
})
