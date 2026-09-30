import { decodeTaskResponse, type Task } from "@app/api-client"
import type { TaskDraft } from "@app/protocol"
import { type DomainContext, defineAction } from "../runtime.ts"
import { validationError } from "../shared/errors.ts"
import { labelKeys, taskDetailQuery, taskKeys } from "./tasks.queries.ts"
import { validateTaskDraft } from "./tasks.validators.ts"
import { draftFromTask } from "./tasks.vm.ts"

const nullIfEmpty = (s: string) => (s.trim() === "" ? null : s)
const sameSet = (a: string[], b: string[]) =>
  a.length === b.length && [...a].sort().every((x, i) => x === [...b].sort()[i])

/** Only the scalar fields that differ from what's saved (sent as PATCH). */
export function diffTask(
  saved: TaskDraft,
  draft: TaskDraft
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (draft.title.trim() !== saved.title) patch.title = draft.title.trim()
  if (draft.description.trim() !== saved.description) {
    patch.description = nullIfEmpty(draft.description)
  }
  for (const key of ["status", "priority", "startDate", "endDate"] as const) {
    if (draft[key] !== saved[key]) patch[key] = draft[key]
  }
  if (draft.dueDate !== saved.dueDate)
    patch.dueDate = nullIfEmpty(draft.dueDate)
  return patch
}

async function currentTask(ctx: DomainContext, taskId: string): Promise<Task> {
  return (
    ctx.client.getQueryData<Task>(taskKeys.detail(taskId)) ??
    (await ctx.client.fetchQuery(taskDetailQuery(ctx.api, taskId)))
  )
}

export const taskActions = {
  "tasks.create": defineAction(async (draft: TaskDraft, ctx) => {
    const errors = validateTaskDraft(draft)
    if (errors.length) throw validationError(errors)
    const { task } = decodeTaskResponse(
      await ctx.api.post("/tasks", {
        title: draft.title.trim(),
        description: nullIfEmpty(draft.description),
        status: draft.status,
        priority: draft.priority,
        startDate: draft.startDate,
        endDate: draft.endDate,
        dueDate: nullIfEmpty(draft.dueDate),
        assigneeIds: draft.assigneeIds,
        labelIds: draft.labelIds,
      })
    )
    ctx.client.setQueryData(taskKeys.detail(task.id), task)
    await ctx.client.invalidate(taskKeys.lists)
    return { id: task.id }
  }),

  /**
   * Saves a form draft: PATCH only changed fields with If-Match (409 on a
   * stale version), then replace assignees/labels/owners only if changed.
   */
  "tasks.save": defineAction(
    async (input: { taskId: string; draft: TaskDraft }, ctx) => {
      const { taskId, draft } = input
      const errors = validateTaskDraft(draft)
      if (errors.length) throw validationError(errors)
      let task = await currentTask(ctx, taskId)
      const saved = draftFromTask(task)
      const base = `/tasks/${encodeURIComponent(taskId)}`
      let changed = false

      const patch = diffTask(saved, draft)
      if (Object.keys(patch).length) {
        task = decodeTaskResponse(
          await ctx.api.patch(base, patch, {
            headers: { "If-Match": `"${task.version}"` },
          })
        ).task
        changed = true
      }
      const sets = [
        ["assignees", "userIds", draft.assigneeIds, saved.assigneeIds],
        ["labels", "labelIds", draft.labelIds, saved.labelIds],
        ["owners", "userIds", draft.ownerIds, saved.ownerIds],
      ] as const
      for (const [path, field, next, prev] of sets) {
        if (sameSet(next, prev)) continue
        task = decodeTaskResponse(
          await ctx.api.put(`${base}/${path}`, { [field]: next })
        ).task
        changed = true
      }
      if (changed) {
        ctx.client.setQueryData(taskKeys.detail(taskId), task)
        await ctx.client.invalidate(taskKeys.lists)
      }
      return { changed, version: task.version }
    }
  ),

  "tasks.delete": defineAction(async (input: { taskId: string }, ctx) => {
    await ctx.api.delete(`/tasks/${encodeURIComponent(input.taskId)}`)
    ctx.client.removeQueries(taskKeys.detail(input.taskId))
    await ctx.client.invalidate(taskKeys.lists)
    return null
  }),

  "tasks.refresh": defineAction(async (input: { taskId: string }, ctx) => {
    await ctx.client.invalidate(taskKeys.detail(input.taskId))
    return null
  }),
}

export { labelKeys }
