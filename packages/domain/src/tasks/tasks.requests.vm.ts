import type { ChangeRequest, Task } from "@app/api-client"
import type {
  ChangeRequestVM,
  RequestDraft,
  RequestField,
  Tone,
} from "@app/protocol"
import { formatDay } from "../shared/dates.ts"
import { relativeTime } from "../shared/format.ts"
import { FORMER_MEMBER } from "./tasks.collab.vm.ts"
import { STATUS_LABEL } from "./tasks.labels.ts"

export const REQUEST_FIELDS: RequestField[] = [
  "status",
  "startDate",
  "endDate",
  "dueDate",
]
export const MAX_NOTE = 1000

const STATUS: Record<ChangeRequest["status"], { label: string; tone: Tone }> = {
  PENDING: { label: "Awaiting review", tone: "warning" },
  APPROVED: { label: "Approved", tone: "success" },
  REJECTED: { label: "Rejected", tone: "danger" },
  CANCELED: { label: "Withdrawn", tone: "subtle" },
}

export function requestDraftFromTask(t: Task): RequestDraft {
  return {
    status: t.status,
    startDate: t.startDate,
    endDate: t.endDate,
    dueDate: t.dueDate ?? "",
    assigneeIds: t.assignees.map((a) => a.id).sort(),
  }
}

function reviewText(r: ChangeRequest): string | null {
  const who = r.reviewer?.name ?? FORMER_MEMBER
  switch (r.status) {
    case "APPROVED":
      return `Approved by ${who}`
    case "REJECTED":
      return `Rejected by ${who}${r.reviewNote ? ` · ${r.reviewNote}` : ""}`
    case "CANCELED":
      return "Withdrawn by the requester"
    default:
      return null
  }
}

function valueText(
  field: string,
  value: string,
  today: string,
  locale: string
): string {
  if (field === "status")
    return STATUS_LABEL[value as keyof typeof STATUS_LABEL] ?? value
  if (!value) return "no due date"
  return formatDay(value, today, locale)
}

export interface RequestsVM {
  requests: ChangeRequestVM[]
  requestsText: string
  pendingRequestCount: number
  pendingFields: Partial<Record<RequestField, string>>
  pendingAssigneesText: string | null
  /** itemId / attachmentId → marker text. */
  pendingItems: Map<string, string>
}

/** Requests list (pending first) plus the per-field pending markers. */
export function toRequests(
  t: Task,
  userId: string,
  now: number,
  today: string,
  locale: string
): RequestsVM {
  const pending = t.requests.filter((r) => r.status === "PENDING")
  const ordered = [
    ...pending,
    ...t.requests.filter((r) => r.status !== "PENDING"),
  ]
  const requests = ordered.map(
    (r): ChangeRequestVM => ({
      id: r.id,
      summary: r.summary,
      statusLabel: STATUS[r.status].label,
      tone: STATUS[r.status].tone,
      isPending: r.status === "PENDING",
      requesterName: r.requester?.name ?? FORMER_MEMBER,
      requesterImage: r.requester?.image ?? null,
      metaText: `${r.requester?.name ?? FORMER_MEMBER} · ${relativeTime(r.createdAt, now, locale)}`,
      note: r.note,
      reviewText: reviewText(r),
      canReview: r.status === "PENDING" && t.viewer.canManage,
      canWithdraw: r.status === "PENDING" && r.requester?.id === userId,
    })
  )
  const pendingFields: Partial<Record<RequestField, string>> = {}
  const assignees: string[] = []
  const pendingItems = new Map<string, string>()
  for (const r of pending) {
    const p = r.payload
    if (r.kind === "UPDATE" && p.field) {
      const field = p.field as RequestField
      pendingFields[field] =
        `Awaiting approval: ${valueText(field, p.value ?? "", today, locale)}`
    } else if (r.kind === "ASSIGNEE_ADD" || r.kind === "ASSIGNEE_REMOVE") {
      assignees.push(r.summary)
    } else if (p.itemId) {
      pendingItems.set(p.itemId, `Awaiting approval: ${r.summary}`)
    } else if (p.attachmentId) {
      pendingItems.set(p.attachmentId, "Awaiting approval: removal")
    }
  }
  const n = pending.length
  return {
    requests,
    requestsText:
      n > 0
        ? `${n} awaiting review`
        : requests.length
          ? `${requests.length} past ${requests.length === 1 ? "request" : "requests"}`
          : "No requests yet",
    pendingRequestCount: n,
    pendingFields,
    pendingAssigneesText: assignees.length
      ? `Awaiting approval: ${assignees.join(", ")}`
      : null,
    pendingItems,
  }
}
