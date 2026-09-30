import {
  decodeInviteCodeResponse,
  decodeWorkspaceResponse,
} from "@app/api-client"
import type { WorkspaceRefVM } from "@app/protocol"
import { defineAction } from "../runtime.ts"
import { validationError } from "../shared/errors.ts"
import { sessionKeys } from "./session.queries.ts"
import {
  validateInviteCode,
  validateWorkspaceName,
} from "./session.validators.ts"

type NoInput = Record<string, never>

function ref(raw: unknown): WorkspaceRefVM {
  const { workspace } = decodeWorkspaceResponse(raw)
  return { id: workspace.id, name: workspace.name }
}

export const sessionActions = {
  "auth.logout": defineAction(async (_: NoInput, ctx) => {
    await ctx.api.post("/auth/logout")
    ctx.resetData()
    return null
  }),

  "workspaces.create": defineAction(async (input: { name: string }, ctx) => {
    const errors = validateWorkspaceName(input.name)
    if (errors.length) throw validationError(errors)
    const created = ref(
      await ctx.api.post("/workspaces", { name: input.name.trim() })
    )
    ctx.resetData()
    return created
  }),

  "workspaces.join": defineAction(
    async (input: { inviteCode: string }, ctx) => {
      const errors = validateInviteCode(input.inviteCode)
      if (errors.length) throw validationError(errors)
      const joined = ref(
        await ctx.api.post("/workspaces/join", {
          inviteCode: input.inviteCode.trim(),
        })
      )
      ctx.resetData()
      return joined
    }
  ),

  "workspaces.switch": defineAction(
    async (input: { workspaceId: string }, ctx) => {
      const switched = ref(
        await ctx.api.post("/workspaces/switch", {
          workspaceId: input.workspaceId,
        })
      )
      ctx.resetData()
      return switched
    }
  ),

  "workspaces.rotateInvite": defineAction(async (_: NoInput, ctx) => {
    const result = decodeInviteCodeResponse(
      await ctx.api.post("/workspaces/current/invite-code/rotate")
    )
    await ctx.client.invalidate(sessionKeys.all)
    return result
  }),
}
