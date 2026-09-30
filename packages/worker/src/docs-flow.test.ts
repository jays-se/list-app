import type { DocDetailVM, DocsVM, ToMain } from "@app/protocol"
import { describe, expect, it, vi } from "vitest"
import { createKernel } from "./create-kernel.ts"

const person = { id: "u1", name: "Ada", image: null }

function makeDoc(over: Record<string, unknown> = {}) {
  return {
    id: "d1",
    title: "Plan",
    content: "# Plan",
    client: null,
    createdBy: person,
    updatedBy: person,
    createdAt: "2026-10-01T09:00:00Z",
    updatedAt: "2026-10-01T09:00:00Z",
    version: 1,
    files: [] as unknown[],
    viewer: { canDelete: true },
    ...over,
  }
}

function setup() {
  let doc = makeDoc()
  const created: unknown[] = []
  const patches: { body: unknown; ifMatch: string | null }[] = []
  let failPatch: number | null = null
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const headers = new Headers(init?.headers)
    if (path === "/clients") return json({ clients: [] })
    if (path.startsWith("/docs?") || path === "/docs") {
      if (method === "POST") {
        created.push(body)
        return json(
          {
            doc: makeDoc({
              id: `n${created.length}`,
              title: body.title,
              content: body.content,
            }),
          },
          201
        )
      }
      return json({
        docs: [
          {
            id: "d1",
            title: "Plan",
            excerpt: "# Plan\n**bold** [x](https://x.io)",
            client: null,
            createdBy: person,
            updatedBy: null,
            updatedAt: "2026-10-01T09:00:00Z",
            version: 1,
            fileCount: 2,
          },
        ],
      })
    }
    if (path === "/docs/d1" && method === "GET") return json({ doc })
    if (path === "/docs/d1" && method === "PATCH") {
      patches.push({ body, ifMatch: headers.get("If-Match") })
      if (failPatch) {
        const status = failPatch
        failPatch = null
        return json(
          {
            type: "x",
            title: "x",
            status,
            detail: status === 409 ? "Someone else changed this doc." : "boom",
          },
          status
        )
      }
      doc = { ...doc, ...body, version: doc.version + 1 }
      return json({ doc })
    }
    if (path === "/docs/d1" && method === "DELETE")
      return new Response(null, { status: 204 })
    if (/^\/docs\/n\d+\/files$/.test(path) || path === "/docs/d1/files")
      return json(
        {
          attachment: {
            id: "f1",
            filename: body.filename,
            mimeType: body.mimeType,
            size: body.size,
            uploadedBy: null,
            createdAt: "2026-10-01T09:00:00Z",
            downloadUrl: "/api/v1/doc-files/f1",
          },
          upload: { method: "PUT", url: "/blob", headers: {} },
        },
        201
      )
    if (path === "/doc-files/f1/complete") return json({ attachment: {} })
    if (path === "/doc-files/f1" && method === "DELETE")
      return new Response(null, { status: 204 })
    return json({ type: "x", title: "x", status: 404, detail: "nope" }, 404)
  })
  const posts: ToMain[] = []
  const upload = vi.fn(
    async (_t: unknown, _f: Blob, progress: (p: number) => void) =>
      progress(100)
  )
  const kernel = createKernel({
    post: (m) => posts.push(m),
    fetch,
    locale: "en-GB",
    upload,
    now: () => Date.parse("2026-10-01T10:00:00Z"),
  })
  const settle = async (n = 10) => {
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
    for (let i = 0; i < 300; i++) {
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
    for (const p of posts)
      if (
        p.kind === "push" &&
        p.topic === "view" &&
        p.data.subId === subId &&
        !p.data.dataUnchanged
      )
        last = (p.data.state.data as T | undefined) ?? last
    return last
  }
  return {
    run,
    subscribe,
    data,
    settle,
    patches,
    created,
    upload,
    failNext: (s: number) => {
      failPatch = s
    },
  }
}

describe("docs through the kernel", () => {
  it("lists docs with plain excerpts", async () => {
    const t = setup()
    await t.subscribe("l", "docs.list", {})
    expect(t.data<DocsVM>("l")).toMatchObject({
      countText: "1 doc",
      docs: [
        {
          excerpt: "Plan bold x",
          fileCountText: "2 files",
          metaText: "Edited 1 h ago by A former member",
        },
      ],
    })
  })

  it("autosaves after a pause, coalescing edits, with If-Match", async () => {
    const t = setup()
    await t.subscribe("d", "docs.detail", { docId: "d1" })
    expect(t.data<DocDetailVM>("d")).toMatchObject({
      saveState: "saved",
      editorKey: "d1:1",
      wordCountText: "2 words",
    })
    await t.run("docs.edit", { docId: "d1", content: "# Plan\n- a" })
    await t.run("docs.edit", {
      docId: "d1",
      content: "# Plan\n- a\n- b",
      title: "Plan v2",
    })
    await t.settle()
    expect(t.data<DocDetailVM>("d")).toMatchObject({
      saveState: "unsaved",
      hasPendingChanges: true,
      editorKey: "d1:local",
      title: "Plan v2",
    })
    expect(t.data<DocDetailVM>("d")?.blocks[1]).toMatchObject({ t: "ul" })
    expect(t.patches).toHaveLength(0)
    await new Promise((r) => setTimeout(r, 900))
    await t.settle()
    expect(t.patches).toEqual([
      {
        body: { title: "Plan v2", content: "# Plan\n- a\n- b" },
        ifMatch: '"1"',
      },
    ])
    expect(t.data<DocDetailVM>("d")).toMatchObject({
      saveState: "saved",
      saveText: "All changes saved",
      hasPendingChanges: false,
    })
    // No change → flush sends nothing.
    await t.run("docs.flush", { docId: "d1" })
    expect(t.patches).toHaveLength(1)
    // Next edit uses the new version.
    await t.run("docs.edit", { docId: "d1", clientId: "", title: "Plan v3" })
    await t.run("docs.flush", { docId: "d1" })
    expect(t.patches[1]).toEqual({ body: { title: "Plan v3" }, ifMatch: '"2"' })
  })

  it("surfaces errors and conflicts; reload discards the draft", async () => {
    const t = setup()
    await t.subscribe("d", "docs.detail", { docId: "d1" })
    await t.run("docs.edit", { docId: "d1", content: "mine" })
    t.failNext(500)
    expect(await t.run("docs.flush", { docId: "d1" })).toMatchObject({
      ok: false,
    })
    await t.settle()
    expect(t.data<DocDetailVM>("d")).toMatchObject({
      saveState: "error",
      saveText: "Couldn't save: boom",
    })
    t.failNext(409)
    await t.run("docs.flush", { docId: "d1" })
    await t.settle()
    expect(t.data<DocDetailVM>("d")?.saveState).toBe("conflict")
    // Editing during a conflict doesn't autosave over the other version.
    await t.run("docs.edit", { docId: "d1", content: "mine 2" })
    await t.settle()
    expect(t.data<DocDetailVM>("d")?.saveState).toBe("conflict")
    await t.run("docs.reload", { docId: "d1" })
    await t.settle()
    expect(t.data<DocDetailVM>("d")).toMatchObject({
      saveState: "saved",
      content: "# Plan",
      editorKey: "d1:1",
    })
  })

  it("creates, uploads files as docs, attaches, removes and deletes", async () => {
    const t = setup()
    expect(await t.run("docs.create", { title: "  " })).toMatchObject({
      ok: true,
      data: { id: "n1" },
    })
    expect(t.created[0]).toEqual({
      title: "Untitled doc",
      content: "",
      clientId: null,
    })
    const md = new File(["# Notes\nhi"], "notes.md", { type: "text/markdown" })
    const pdf = new File(["%PDF"], "brief.pdf", { type: "application/pdf" })
    const empty = new File([], "empty.txt")
    const reply = await t.run("docs.upload", {
      files: [md, pdf, empty],
      clientId: "c1",
    })
    expect(reply).toMatchObject({
      ok: true,
      data: {
        ids: ["n2", "n3"],
        failed: [{ filename: "empty.txt", message: "empty.txt is empty" }],
      },
    })
    expect(t.created[1]).toEqual({
      title: "notes",
      content: "# Notes\nhi",
      clientId: "c1",
    })
    expect(t.created[2]).toEqual({
      title: "brief.pdf",
      content: "",
      clientId: "c1",
    })
    expect(t.upload).toHaveBeenCalledTimes(1)

    await t.subscribe("d", "docs.detail", { docId: "d1" })
    const big = { name: "big.bin", size: 21 * 1024 * 1024, type: "" } as File
    expect(
      await t.run("docs.attach", { docId: "d1", files: [pdf, big] })
    ).toMatchObject({
      ok: true,
      data: {
        uploaded: 1,
        failed: [{ message: "big.bin is larger than 20MB" }],
      },
    })
    expect(
      await t.run("docs.removeFile", { docId: "d1", fileId: "f1" })
    ).toMatchObject({ ok: true })
    expect(await t.run("docs.delete", { docId: "d1" })).toMatchObject({
      ok: true,
    })
  })
})
