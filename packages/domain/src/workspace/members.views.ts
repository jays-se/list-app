import { defineView } from "../runtime.ts"
import { sessionQuery } from "../session/session.queries.ts"
import { membersQuery } from "./members.queries.ts"
import { toMembersVM } from "./members.vm.ts"

export const workspaceViews = {
  "workspace.members": defineView({
    queries: (_params: Record<string, never>, ctx) => ({
      members: membersQuery(ctx.api),
      session: sessionQuery(ctx.api),
    }),
    compute: ({ members, session }, _params, ctx) =>
      toMembersVM(members, session.user?.id ?? null, ctx.locale),
  }),
}
