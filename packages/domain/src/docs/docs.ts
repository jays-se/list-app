import {
  type ApiClient,
  type ClientList,
  type Doc,
  type DocSummary,
  decodeDocList,
  decodeDocResponse,
} from "@app/api-client"
import type { DocDetailVM, DocRowVM, DocSaveState, DocsVM } from "@app/protocol"
import type { QueryOptions } from "@app/query"
import { defineView } from "../runtime.ts"
import { formatBytes, relativeTime } from "../shared/format.ts"
import { FORMER_MEMBER } from "../tasks/tasks.collab.vm.ts"
import { clientsQuery } from "../tasks/tasks.queries.ts"
import { parseMarkdown, plainText } from "./markdown.ts"

export const MAX_DOC_FILES = 10
export const MAX_DOC_FILE_BYTES = 20 * 1024 * 1024
export const MAX_TEXT_IMPORT_BYTES = 1024 * 1024

export const docKeys = {
  all: ["docs"] as const,
  lists: ["docs", "list"] as const,
  list: (clientId: string) => ["docs", "list", clientId] as const,
  detail: (id: string) => ["docs", "detail", id] as const,
  draft: (id: string) => ["docs", "draft", id] as const,
}

/** Local, unsaved edits for one doc (worker state, never fetched). */
export interface DocDraft {
  title: string
  content: string
  clientId: string
  /** The server version the edits are based on (sent as If-Match). */
  baseVersion: number
  dirty: boolean
  state: DocSaveState
  error: string | null
}

export function docsListQuery(
  api: ApiClient,
  clientId: string
): QueryOptions<DocSummary[]> {
  return {
    key: docKeys.list(clientId),
    ttl: 5_000,
    refetchInterval: 30_000,
    fetcher: async ({ signal }) =>
      decodeDocList(
        await api.get(
          clientId ? `/docs?clientId=${encodeURIComponent(clientId)}` : "/docs",
          { signal }
        )
      ).docs,
  }
}

export function docQuery(api: ApiClient, id: string): QueryOptions<Doc> {
  return {
    key: docKeys.detail(id),
    ttl: 5_000,
    // Picks up teammates' edits while there are no local ones.
    refetchInterval: 30_000,
    retry: 0,
    fetcher: async ({ signal }) =>
      decodeDocResponse(
        await api.get(`/docs/${encodeURIComponent(id)}`, { signal })
      ).doc,
  }
}

export function draftQuery(id: string): QueryOptions<DocDraft | null> {
  return {
    key: docKeys.draft(id),
    ttl: Number.POSITIVE_INFINITY,
    fetcher: async () => null,
  }
}

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

export function toDocRowVM(
  d: DocSummary,
  now: number,
  locale: string
): DocRowVM {
  const text = plainText(parseMarkdown(d.excerpt))
  return {
    id: d.id,
    title: d.title,
    excerpt: text.length > 160 ? `${text.slice(0, 159)}…` : text,
    metaText: `Edited ${relativeTime(d.updatedAt, now, locale)} by ${d.updatedBy?.name ?? FORMER_MEMBER}`,
    client: d.client ? { name: d.client.name, color: d.client.color } : null,
    fileCountText: d.fileCount ? plural(d.fileCount, "file") : null,
  }
}

export function toDocsVM(
  docs: DocSummary[],
  now: number,
  locale: string
): DocsVM {
  return {
    docs: docs.map((d) => toDocRowVM(d, now, locale)),
    countText: plural(docs.length, "doc"),
    isEmpty: docs.length === 0,
    emptyText: "No docs yet. Write one, or upload a file to start from.",
  }
}

const SAVE_TEXT: Record<DocSaveState, string> = {
  saved: "All changes saved",
  unsaved: "Unsaved changes",
  saving: "Saving…",
  error: "Couldn't save",
  conflict:
    "Someone else changed this doc. Reload to see their version — your unsaved edits will be lost.",
}

export function toDocDetailVM(
  doc: Doc,
  draft: DocDraft | null,
  clients: ClientList,
  now: number,
  locale: string
): DocDetailVM {
  // Once edited here, the local draft is what the editor shows; a
  // teammate's newer version surfaces as a conflict on the next save.
  const title = draft ? draft.title : doc.title
  const content = draft ? draft.content : doc.content
  const clientId = draft ? draft.clientId : (doc.client?.id ?? "")
  const state: DocSaveState = draft ? draft.state : "saved"
  const words = content.trim() ? content.trim().split(/\s+/).length : 0
  return {
    id: doc.id,
    editorKey: `${doc.id}:${draft ? "local" : doc.version}`,
    title,
    content,
    clientId,
    blocks: parseMarkdown(content),
    saveState: state,
    saveText:
      state === "error" && draft?.error
        ? `${SAVE_TEXT.error}: ${draft.error}`
        : SAVE_TEXT[state],
    hasPendingChanges: state !== "saved",
    wordCountText: plural(words, "word"),
    metaText: `Created by ${doc.createdBy?.name ?? FORMER_MEMBER} · edited ${relativeTime(doc.updatedAt, now, locale)} by ${doc.updatedBy?.name ?? FORMER_MEMBER}`,
    clientOptions: [
      { value: "", label: "No client" },
      ...clients.clients.map((c) => ({
        value: c.id,
        label: c.name,
        color: c.color,
      })),
    ],
    files: doc.files.map((f) => ({
      id: f.id,
      filename: f.filename,
      sizeText: formatBytes(f.size),
      metaText: `${f.uploadedBy?.name ?? FORMER_MEMBER} · ${relativeTime(f.createdAt, now, locale)}`,
      downloadUrl: f.downloadUrl,
      pendingText: null,
    })),
    filesText: `${doc.files.length} of ${MAX_DOC_FILES} · up to 20 MB each`,
    canAttach: doc.files.length < MAX_DOC_FILES,
    canDelete: doc.viewer.canDelete,
  }
}

export const docViews = {
  "docs.list": defineView({
    queries: (p: { clientId?: string }, ctx) => ({
      docs: docsListQuery(ctx.api, p.clientId ?? ""),
    }),
    compute: ({ docs }, _p, ctx) => toDocsVM(docs, ctx.now(), ctx.locale),
  }),
  "docs.detail": defineView({
    queries: (p: { docId: string }, ctx) => ({
      doc: docQuery(ctx.api, p.docId),
      draft: draftQuery(p.docId),
      clients: clientsQuery(ctx.api),
    }),
    compute: ({ doc, draft, clients }, _p, ctx) =>
      toDocDetailVM(doc, draft, clients, ctx.now(), ctx.locale),
  }),
}
