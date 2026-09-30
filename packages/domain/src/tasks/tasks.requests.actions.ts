import { decodeTaskResponse } from "@app/api-client"
import type {
  RequestDraft,
  RequestKind,
  RequestPayloadInput,
} from "@app/protocol"
import { type DomainContext, defineAction } from "../runtime.ts"
import { validationError } from "../shared/errors.ts"
import { currentTask } from "./tasks.actions.ts"
import { historyKey } from "./tasks.history.ts"
import { taskKeys } from "./tasks.queries.ts"
import {
  MAX_NOTE,
  REQUEST_FIELDS,
  requestDraftFromTask,
} from "./tasks.requests.vm.ts"

const enc = encodeURIComponent

interface RequestBody {
  kind: RequestKind
  payload: RequestPayloadInput
  note?: string | null
}

function checkNote(note: string | undefined) {
  if (note && [...note.trim()].length > MAX_NOTE) {
    throw validationError([
      { field: "note", message: "Notes must be 1,000 characters or fewer" },
    ])
  }
}

/** Store the returned task and refresh what its change affects. */
async function applyResponse(ctx: DomainContext, taskId: string, raw: unknown) {
  ctx.client.setQueryData(taskKeys.detail(taskId), decodeTaskResponse(raw).task)
  await Promise.all([
    ctx.client.invalidate(taskKeys.lists),
    ctx.client.invalidate(historyKey(taskId)),
  ])
}

/** One request per changed field and per assignee added or removed. */
export function requestBodies(
  saved: RequestDraft,
  draft: RequestDraft
): RequestBody[] {
  const out: RequestBody[] = []
  for (const field of REQUEST_FIELDS) {
    if (draft[field] !== saved[field]) {
      out.push({ kind: "UPDATE", payload: { field, value: draft[field] } })
    }
  }
  for (const id of draft.assigneeIds) {
    if (!saved.assigneeIds.includes(id))
      out.push({ kind: "ASSIGNEE_ADD", payload: { userId: id } })
  }
  for (const id of saved.assigneeIds) {
    if (!draft.assigneeIds.includes(id))
      out.push({ kind: "ASSIGNEE_REMOVE", payload: { userId: id } })
  }
  return out
}

function checkDates(d: RequestDraft) {
  if (!d.startDate || !d.endDate) {
    throw validationError([
      {
        field: d.startDate ? "endDate" : "startDate",
        message: "Start and end date are required",
      },
    ])
  }
  if (d.endDate < d.startDate) {
    throw validationError([
      { field: "endDate", message: "End date must be on or after start date" },
    ])
  }
}

export const requestActions = {
  "requests.submit": defineAction(
    async (
      input: { taskId: string; draft: RequestDraft; note: string },
      ctx
    ) => {
      checkNote(input.note)
      checkDates(input.draft)
      const task = await currentTask(ctx, input.taskId)
      const bodies = requestBodies(requestDraftFromTask(task), input.draft)
      if (bodies.length === 0) {
        throw validationError([
          { field: "form", message: "Change something to request it." },
        ])
      }
      const note = input.note.trim() || null
      let created = 0
      try {
        for (const body of bodies) {
          await applyResponse(
            ctx,
            input.taskId,
            await ctx.api.post(`/tasks/${enc(input.taskId)}/requests`, {
              ...body,
              note,
            })
          )
          created++
        }
      } catch (error) {
        // Some may have been filed: show them, then report the failure.
        await ctx.client.invalidate(taskKeys.detail(input.taskId))
        throw error
      }
      return { created }
    }
  ),

  "requests.propose": defineAction(
    async (
      input: {
        taskId: string
        kind: RequestKind
        payload: RequestPayloadInput
        note?: string
      },
      ctx
    ) => {
      checkNote(input.note)
      await applyResponse(
        ctx,
        input.taskId,
        await ctx.api.post(`/tasks/${enc(input.taskId)}/requests`, {
          kind: input.kind,
          payload: input.payload,
          note: input.note?.trim() || null,
        })
      )
      return null
    }
  ),

  "requests.approve": defineAction(
    async (input: { taskId: string; requestId: string }, ctx) => {
      await applyResponse(
        ctx,
        input.taskId,
        await ctx.api.post(`/requests/${enc(input.requestId)}/approve`)
      )
      return null
    }
  ),

  "requests.reject": defineAction(
    async (input: { taskId: string; requestId: string; note: string }, ctx) => {
      checkNote(input.note)
      await applyResponse(
        ctx,
        input.taskId,
        await ctx.api.post(`/requests/${enc(input.requestId)}/reject`, {
          note: input.note.trim() || null,
        })
      )
      return null
    }
  ),

  "requests.withdraw": defineAction(
    async (input: { taskId: string; requestId: string }, ctx) => {
      await applyResponse(
        ctx,
        input.taskId,
        await ctx.api.post(`/requests/${enc(input.requestId)}/cancel`)
      )
      return null
    }
  ),
}
