import {
  AppError,
  type Doc,
  decodeAttachmentUploadResponse,
  decodeDocResponse,
} from "@app/api-client"
import type { QueryClient } from "@app/query"
import { type DomainContext, defineAction } from "../runtime.ts"
import { validationError } from "../shared/errors.ts"
import {
  type DocDraft,
  docKeys,
  docQuery,
  MAX_DOC_FILE_BYTES,
  MAX_DOC_FILES,
  MAX_TEXT_IMPORT_BYTES,
} from "./docs.ts"

const enc = encodeURIComponent
export const AUTOSAVE_MS = 800

/** Per-kernel autosave state (timers and in-flight saves), keyed by doc. */
interface SaveState {
  timers: Map<string, ReturnType<typeof setTimeout>>
  inflight: Map<string, Promise<void>>
}
const states = new WeakMap<QueryClient, SaveState>()
function saveState(client: QueryClient): SaveState {
  let s = states.get(client)
  if (!s) {
    s = { timers: new Map(), inflight: new Map() }
    states.set(client, s)
  }
  return s
}

async function currentDoc(ctx: DomainContext, id: string): Promise<Doc> {
  return (
    ctx.client.getQueryData<Doc>(docKeys.detail(id)) ??
    (await ctx.client.fetchQuery(docQuery(ctx.api, id)))
  )
}

const fromDoc = (d: Doc): DocDraft => ({
  title: d.title,
  content: d.content,
  clientId: d.client?.id ?? "",
  baseVersion: d.version,
  dirty: false,
  state: "saved",
  error: null,
})

const draftOf = (ctx: DomainContext, id: string) =>
  ctx.client.getQueryData<DocDraft | null>(docKeys.draft(id)) ?? null

function schedule(ctx: DomainContext, id: string) {
  const s = saveState(ctx.client)
  clearTimeout(s.timers.get(id))
  s.timers.set(
    id,
    setTimeout(() => {
      s.timers.delete(id)
      void save(ctx, id)
    }, AUTOSAVE_MS)
  )
}

/** Saves the draft once; edits made meanwhile are saved by a follow-up. */
function save(ctx: DomainContext, id: string): Promise<void> {
  const s = saveState(ctx.client)
  clearTimeout(s.timers.get(id))
  s.timers.delete(id)
  const running = s.inflight.get(id)
  if (running) return running.then(() => save(ctx, id))
  const draft = draftOf(ctx, id)
  if (!draft?.dirty) return Promise.resolve()
  const promise = (async () => {
    const doc = await currentDoc(ctx, id)
    const sent = {
      title: draft.title,
      content: draft.content,
      clientId: draft.clientId,
    }
    const patch: Record<string, unknown> = {}
    if (sent.title.trim() !== doc.title) patch.title = sent.title
    if (sent.content !== doc.content) patch.content = sent.content
    if (sent.clientId !== (doc.client?.id ?? ""))
      patch.clientId = sent.clientId || null
    if (Object.keys(patch).length === 0) {
      ctx.client.setQueryData(docKeys.draft(id), {
        ...draft,
        dirty: false,
        state: "saved" as const,
      })
      return
    }
    ctx.client.setQueryData(docKeys.draft(id), {
      ...draft,
      state: "saving" as const,
    })
    try {
      const saved = decodeDocResponse(
        await ctx.api.patch(`/docs/${enc(id)}`, patch, {
          headers: { "If-Match": `"${draft.baseVersion}"` },
        })
      ).doc
      ctx.client.setQueryData(docKeys.detail(id), saved)
      const now = draftOf(ctx, id) ?? draft
      const changed =
        now.title !== sent.title ||
        now.content !== sent.content ||
        now.clientId !== sent.clientId
      ctx.client.setQueryData(docKeys.draft(id), {
        ...now,
        baseVersion: saved.version,
        dirty: changed,
        state: changed ? ("unsaved" as const) : ("saved" as const),
        error: null,
      })
      if (changed) schedule(ctx, id)
      void ctx.client.invalidate(docKeys.lists)
    } catch (error) {
      const now = draftOf(ctx, id) ?? draft
      const conflict = error instanceof AppError && error.status === 409
      ctx.client.setQueryData(docKeys.draft(id), {
        ...now,
        state: conflict ? ("conflict" as const) : ("error" as const),
        error: error instanceof Error ? error.message : "Try again",
      })
    }
  })().finally(() => s.inflight.delete(id))
  s.inflight.set(id, promise)
  return promise
}

const baseName = (name: string) => name.replace(/\.[^.]+$/, "").trim() || name
const isText = (f: File) =>
  /\.(md|markdown|txt)$/i.test(f.name) ||
  f.type === "text/markdown" ||
  f.type === "text/plain"

let uploadSeq = 0

/** Reserve → PUT (progress pushed) → complete, for one file on a doc. */
async function uploadFile(ctx: DomainContext, docId: string, file: File) {
  const uploadId = `d${++uploadSeq}`
  const report = (
    percent: number,
    state: "uploading" | "done" | "failed",
    error?: string
  ) =>
    ctx.notify({
      taskId: docId,
      uploadId,
      filename: file.name,
      percent,
      state,
      ...(error ? { error } : {}),
    })
  try {
    report(0, "uploading")
    const slot = decodeAttachmentUploadResponse(
      await ctx.api.post(`/docs/${enc(docId)}/files`, {
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
      })
    )
    await ctx.upload(slot.upload, file, (p) => report(p, "uploading"))
    await ctx.api.post(`/doc-files/${enc(slot.attachment.id)}/complete`)
    report(100, "done")
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Could not upload the file"
    report(0, "failed", message)
    throw error
  }
}

function checkFile(file: File): string | null {
  if (file.size === 0) return `${file.name} is empty`
  if (file.size > MAX_DOC_FILE_BYTES) return `${file.name} is larger than 20MB`
  return null
}

export const docActions = {
  "docs.create": defineAction(
    async (input: { title: string; clientId?: string }, ctx) => {
      const title = input.title.trim() || "Untitled doc"
      const { doc } = decodeDocResponse(
        await ctx.api.post("/docs", {
          title,
          content: "",
          clientId: input.clientId || null,
        })
      )
      ctx.client.setQueryData(docKeys.detail(doc.id), doc)
      await ctx.client.invalidate(docKeys.lists)
      return { id: doc.id }
    }
  ),

  "docs.upload": defineAction(
    async (input: { files: File[]; clientId?: string }, ctx) => {
      const ids: string[] = []
      const failed: { filename: string; message: string }[] = []
      for (const file of input.files) {
        const problem = checkFile(file)
        if (problem) {
          failed.push({ filename: file.name, message: problem })
          continue
        }
        try {
          const asText = isText(file) && file.size <= MAX_TEXT_IMPORT_BYTES
          const { doc } = decodeDocResponse(
            await ctx.api.post("/docs", {
              title: (asText ? baseName(file.name) : file.name).slice(0, 200),
              content: asText ? await file.text() : "",
              clientId: input.clientId || null,
            })
          )
          if (!asText) await uploadFile(ctx, doc.id, file)
          ids.push(doc.id)
        } catch (error) {
          failed.push({
            filename: file.name,
            message:
              error instanceof Error
                ? error.message
                : "Could not read the file",
          })
        }
      }
      await ctx.client.invalidate(docKeys.lists)
      return { ids, failed }
    }
  ),

  "docs.edit": defineAction(
    async (
      input: {
        docId: string
        title?: string
        content?: string
        clientId?: string
      },
      ctx
    ) => {
      const doc = await currentDoc(ctx, input.docId)
      const prev = draftOf(ctx, input.docId)
      const base = prev ?? fromDoc(doc)
      const next: DocDraft = {
        ...base,
        ...(input.title !== undefined ? { title: input.title } : {}),
        ...(input.content !== undefined ? { content: input.content } : {}),
        ...(input.clientId !== undefined ? { clientId: input.clientId } : {}),
        dirty: true,
        state: base.state === "conflict" ? "conflict" : "unsaved",
        error: base.state === "conflict" ? base.error : null,
      }
      ctx.client.setQueryData(docKeys.draft(input.docId), next)
      if (next.state !== "conflict") schedule(ctx, input.docId)
      return null
    }
  ),

  "docs.flush": defineAction(async (input: { docId: string }, ctx) => {
    await save(ctx, input.docId)
    const d = draftOf(ctx, input.docId)
    if (d && (d.state === "error" || d.state === "conflict")) {
      throw validationError([
        { field: "content", message: d.error ?? "Couldn't save" },
      ])
    }
    return null
  }),

  "docs.reload": defineAction(async (input: { docId: string }, ctx) => {
    const s = saveState(ctx.client)
    clearTimeout(s.timers.get(input.docId))
    s.timers.delete(input.docId)
    ctx.client.setQueryData(docKeys.draft(input.docId), null)
    await ctx.client.invalidate(docKeys.detail(input.docId))
    return null
  }),

  "docs.delete": defineAction(async (input: { docId: string }, ctx) => {
    await ctx.api.delete(`/docs/${enc(input.docId)}`)
    const s = saveState(ctx.client)
    clearTimeout(s.timers.get(input.docId))
    ctx.client.removeQueries(docKeys.detail(input.docId))
    ctx.client.removeQueries(docKeys.draft(input.docId))
    await ctx.client.invalidate(docKeys.lists)
    return null
  }),

  "docs.attach": defineAction(
    async (input: { docId: string; files: File[] }, ctx) => {
      const doc = await currentDoc(ctx, input.docId)
      let room = MAX_DOC_FILES - doc.files.length
      let uploaded = 0
      const failed: { filename: string; message: string }[] = []
      for (const file of input.files) {
        const problem =
          checkFile(file) ??
          (room <= 0 ? `A doc can have up to ${MAX_DOC_FILES} files` : null)
        if (problem) {
          failed.push({ filename: file.name, message: problem })
          continue
        }
        try {
          await uploadFile(ctx, input.docId, file)
          uploaded++
          room--
        } catch (error) {
          failed.push({
            filename: file.name,
            message: error instanceof Error ? error.message : "Upload failed",
          })
        }
      }
      await Promise.all([
        ctx.client.invalidate(docKeys.detail(input.docId)),
        ctx.client.invalidate(docKeys.lists),
      ])
      return { uploaded, failed }
    }
  ),

  "docs.removeFile": defineAction(
    async (input: { docId: string; fileId: string }, ctx) => {
      await ctx.api.delete(`/doc-files/${enc(input.fileId)}`)
      await Promise.all([
        ctx.client.invalidate(docKeys.detail(input.docId)),
        ctx.client.invalidate(docKeys.lists),
      ])
      return null
    }
  ),
}
