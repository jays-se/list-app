import { defineAction } from "../runtime.ts"
import { sessionKeys } from "../session/session.queries.ts"
import { taskKeys } from "../tasks/tasks.queries.ts"
import { workspaceKeys } from "./members.queries.ts"

/** Member lifecycle (E3-S6). The server does the cleanup in one transaction. */
export const memberActions = {
  /** Leaving changes the tenant: drop everything and refetch the session. */
  "workspaces.leave": defineAction(
    async (_input: Record<string, never>, ctx) => {
      await ctx.api.post("/workspaces/current/leave")
      ctx.resetData()
      return null
    }
  ),

  "members.remove": defineAction(async (input: { userId: string }, ctx) => {
    await ctx.api.delete(
      `/workspaces/current/members/${encodeURIComponent(input.userId)}`
    )
    // Their assignments and ownerships are gone from every task.
    await Promise.all([
      ctx.client.invalidate(workspaceKeys.members),
      ctx.client.invalidate(taskKeys.all),
    ])
    return null
  }),

  "members.setRole": defineAction(
    async (input: { userId: string; role: "OWNER" | "MEMBER" }, ctx) => {
      await ctx.api.patch(
        `/workspaces/current/members/${encodeURIComponent(input.userId)}`,
        { role: input.role }
      )
      await Promise.all([
        ctx.client.invalidate(workspaceKeys.members),
        ctx.client.invalidate(sessionKeys.all),
      ])
      return null
    }
  ),
}
