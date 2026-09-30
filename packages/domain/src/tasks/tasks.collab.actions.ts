import {
  decodeAttachmentUploadResponse,
  decodeTaskResponse,
  type MemberList,
  type Task,
} from "@app/api-client"
import { type DomainContext, defineAction } from "../runtime.ts"
import { validationError } from "../shared/errors.ts"
import { workspaceKeys } from "../workspace/members.queries.ts"
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from "./tasks.collab.vm.ts"
import { taskKeys } from "./tasks.queries.ts"

const enc = encodeURIComponent

/** Refetch the task (and lists, whose counts change). */
async function refresh(ctx: DomainContext, taskId: string) {
  await Promise.all([
    ctx.client.invalidate(taskKeys.detail(taskId)),
    ctx.client.invalidate(taskKeys.lists),
  ])
}

function titleError(field: string, title: string, max: number, what: string) {
  const n = [...title.trim()].length
  if (n === 0)
    return validationError([{ field, message: `${what} needs a title` }])
  if (n > max) {
    return validationError([
      { field, message: `${what} must be ${max} characters or fewer` },
    ])
  }
  return null
}

let uploadSeq = 0

export const collabActions = {
  "tasks.addSubtask": defineAction(
    async (input: { parentId: string; title: string }, ctx) => {
      const err = titleError("title", input.title, 500, "Subtask")
      if (err) throw err
      const parent = ctx.client.getQueryData<Task>(
        taskKeys.detail(input.parentId)
      )
      const today = new Date(ctx.now()).toISOString().slice(0, 10)
      const { task } = decodeTaskResponse(
        await ctx.api.post("/tasks", {
          title: input.title.trim(),
          parentId: input.parentId,
          startDate: parent?.startDate ?? today,
          endDate: parent?.endDate ?? today,
        })
      )
      await refresh(ctx, input.parentId)
      return { id: task.id }
    }
  ),

  "checklist.add": defineAction(
    async (
      input: { taskId: string; title: string; assigneeId: string },
      ctx
    ) => {
      const err = titleError("title", input.title, 200, "Checklist item")
      if (err) throw err
      await ctx.api.post(`/tasks/${enc(input.taskId)}/checklist`, {
        title: input.title.trim(),
        assigneeId: input.assigneeId || null,
      })
      await refresh(ctx, input.taskId)
      return null
    }
  ),

  /** Optimistic: patch the cached task first, roll back on failure. */
  "checklist.update": defineAction(
    async (
      input: {
        taskId: string
        itemId: string
        done?: boolean
        title?: string
        assigneeId?: string
      },
      ctx
    ) => {
      const body: Record<string, unknown> = {}
      if (input.done !== undefined) body.done = input.done
      if (input.title !== undefined) {
        const err = titleError("title", input.title, 200, "Checklist item")
        if (err) throw err
        body.title = input.title.trim()
      }
      if (input.assigneeId !== undefined)
        body.assigneeId = input.assigneeId || null
      const rollback = ctx.client.optimistic<Task>(
        taskKeys.detail(input.taskId),
        (task) =>
          task
            ? {
                ...task,
                checklist: task.checklist.map((c) =>
                  c.id === input.itemId
                    ? {
                        ...c,
                        ...(input.done !== undefined
                          ? { done: input.done }
                          : {}),
                        ...(input.title !== undefined
                          ? { title: input.title.trim() }
                          : {}),
                      }
                    : c
                ),
              }
            : (task as unknown as Task)
      )
      try {
        await ctx.api.patch(`/tasks/checklist/${enc(input.itemId)}`, body)
      } catch (error) {
        rollback()
        throw error
      }
      await refresh(ctx, input.taskId)
      return null
    }
  ),

  "checklist.delete": defineAction(
    async (input: { taskId: string; itemId: string }, ctx) => {
      await ctx.api.delete(`/tasks/checklist/${enc(input.itemId)}`)
      await refresh(ctx, input.taskId)
      return null
    }
  ),

  "comments.add": defineAction(
    async (
      input: { taskId: string; body: string; mentionIds: string[] },
      ctx
    ) => {
      const body = input.body.trim()
      if (!body)
        throw validationError([
          { field: "body", message: "Write a comment first" },
        ])
      if ([...body].length > 5000) {
        throw validationError([
          {
            field: "body",
            message: "Comments must be 5,000 characters or fewer",
          },
        ])
      }
      const members = ctx.client.getQueryData<MemberList>(workspaceKeys.members)
      // Keep only mentions whose "@Name" survived editing.
      const mentionedUserIds = input.mentionIds.filter((id) => {
        const m = members?.members.find((x) => x.id === id)
        return m ? body.includes(`@${m.name}`) : false
      })
      await ctx.api.post(`/tasks/${enc(input.taskId)}/comments`, {
        body,
        mentionedUserIds,
      })
      await refresh(ctx, input.taskId)
      return null
    }
  ),

  /**
   * For each file: check size/count in the worker, reserve a slot, PUT the
   * bytes straight to storage (progress pushed to the UI), then confirm.
   */
  "attachments.upload": defineAction(
    async (input: { taskId: string; files: File[] }, ctx) => {
      const task = ctx.client.getQueryData<Task>(taskKeys.detail(input.taskId))
      let room = MAX_ATTACHMENTS - (task?.attachments.length ?? 0)
      const failed: { filename: string; message: string }[] = []
      let uploaded = 0
      for (const file of input.files) {
        const uploadId = `u${++uploadSeq}`
        const report = (
          percent: number,
          state: "uploading" | "done" | "failed",
          error?: string
        ) =>
          ctx.notify({
            taskId: input.taskId,
            uploadId,
            filename: file.name,
            percent,
            state,
            ...(error ? { error } : {}),
          })
        const fail = (message: string) => {
          failed.push({ filename: file.name, message })
          report(0, "failed", message)
        }
        if (file.size > MAX_ATTACHMENT_BYTES) {
          fail(`${file.name} is larger than 5MB`)
          continue
        }
        if (file.size === 0) {
          fail(`${file.name} is empty`)
          continue
        }
        if (room <= 0) {
          fail(`A task can have up to ${MAX_ATTACHMENTS} attachments`)
          continue
        }
        try {
          report(0, "uploading")
          const slot = decodeAttachmentUploadResponse(
            await ctx.api.post(`/tasks/${enc(input.taskId)}/attachments`, {
              filename: file.name,
              mimeType: file.type || "application/octet-stream",
              size: file.size,
            })
          )
          await ctx.upload(slot.upload, file, (p) => report(p, "uploading"))
          await ctx.api.post(`/attachments/${enc(slot.attachment.id)}/complete`)
          report(100, "done")
          uploaded++
          room--
        } catch (error) {
          fail(
            error instanceof Error ? error.message : "Could not upload the file"
          )
        }
      }
      await refresh(ctx, input.taskId)
      return { uploaded, failed }
    }
  ),

  "attachments.delete": defineAction(
    async (input: { taskId: string; attachmentId: string }, ctx) => {
      await ctx.api.delete(`/attachments/${enc(input.attachmentId)}`)
      await refresh(ctx, input.taskId)
      return null
    }
  ),
}
