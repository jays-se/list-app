import type { Task } from "@app/api-client"
import type {
  AttachmentVM,
  ChecklistItemVM,
  CommentSegmentVM,
  CommentVM,
  SubtaskVM,
} from "@app/protocol"
import { formatBytes, relativeTime } from "../shared/format.ts"
import { STATUS_LABEL } from "./tasks.labels.ts"

export const FORMER_MEMBER = "A former member"
export const MAX_ATTACHMENTS = 5
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

const count = (done: number, total: number, noun: string) =>
  total === 0 ? `No ${noun}s yet` : `${done} of ${total} done`

export function toSubtasks(t: Task): {
  subtasks: SubtaskVM[]
  subtasksText: string
} {
  const subtasks = t.subtasks.map((s) => ({
    id: s.id,
    title: s.title,
    statusLabel: STATUS_LABEL[s.status],
    isDone: s.status === "DONE",
  }))
  return {
    subtasks,
    subtasksText: count(
      subtasks.filter((s) => s.isDone).length,
      subtasks.length,
      "subtask"
    ),
  }
}

export function toChecklist(t: Task): {
  checklist: ChecklistItemVM[]
  checklistText: string
} {
  const checklist = t.checklist.map((c) => ({
    id: c.id,
    title: c.title,
    done: c.done,
    assigneeId: c.assignee?.id ?? "",
    assigneeName: c.assignee?.name ?? null,
  }))
  return {
    checklist,
    checklistText: count(
      checklist.filter((c) => c.done).length,
      checklist.length,
      "item"
    ),
  }
}

/** Splits a body on "@Name" tokens of the comment's mentions. */
export function segments(body: string, names: string[]): CommentSegmentVM[] {
  const tokens = names.map((n) => `@${n}`).sort((a, b) => b.length - a.length)
  if (tokens.length === 0) return [{ text: body, mention: false }]
  const out: CommentSegmentVM[] = []
  let rest = body
  while (rest) {
    let best = -1
    let token = ""
    for (const t of tokens) {
      const i = rest.indexOf(t)
      if (i !== -1 && (best === -1 || i < best)) {
        best = i
        token = t
      }
    }
    if (best === -1) {
      out.push({ text: rest, mention: false })
      break
    }
    if (best > 0) out.push({ text: rest.slice(0, best), mention: false })
    out.push({ text: token, mention: true })
    rest = rest.slice(best + token.length)
  }
  return out
}

export function toComments(t: Task, now: number, locale: string): CommentVM[] {
  return t.comments.map((c) => ({
    id: c.id,
    authorName: c.author?.name ?? FORMER_MEMBER,
    authorImage: c.author?.image ?? null,
    timeText: relativeTime(c.createdAt, now, locale),
    segments: segments(
      c.body,
      c.mentions.map((m) => m.name)
    ),
  }))
}

export function toAttachments(
  t: Task,
  now: number,
  locale: string
): {
  attachments: AttachmentVM[]
  attachmentsText: string
  canAttach: boolean
} {
  const attachments = t.attachments.map((a) => ({
    id: a.id,
    filename: a.filename,
    sizeText: formatBytes(a.size),
    metaText: `${a.uploadedBy?.name ?? FORMER_MEMBER} · ${relativeTime(a.createdAt, now, locale)}`,
    downloadUrl: a.downloadUrl,
  }))
  return {
    attachments,
    attachmentsText: `${attachments.length} of ${MAX_ATTACHMENTS} · up to 5 MB each`,
    canAttach: t.viewer.canManage && attachments.length < MAX_ATTACHMENTS,
  }
}
