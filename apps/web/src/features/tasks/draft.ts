import type { ProtocolError, TaskDraft } from "@app/protocol"

/**
 * Form-draft helpers. A draft is uncommitted UI state (allowed in React per
 * ADR-0005); comparing it with the saved values needs no domain knowledge.
 */
export function sameDraft(a: TaskDraft, b: TaskDraft): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

/** Toggle an id, keeping the list sorted so drafts compare stably. */
export function toggleId(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].sort()
}

export function fieldError(error: ProtocolError | undefined, field: string) {
  return error?.fieldErrors?.find((f) => f.field === field)?.message
}

/** A form-level message when no field claimed the error. */
export function formError(error: ProtocolError | undefined) {
  return error && !error.fieldErrors?.length ? error.message : undefined
}

/** Multi-select results in a stable (sorted) order, like `toggleId`. */
export function sortIds(ids: string[]): string[] {
  return [...ids].sort()
}
