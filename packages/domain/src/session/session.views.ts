import { defineView } from "../runtime.ts"
import { sessionQuery } from "./session.queries.ts"
import { toSessionVM } from "./session.vm.ts"

export const sessionViews = {
  "session.current": defineView({
    queries: (_params: Record<string, never>, ctx) => ({
      session: sessionQuery(ctx.api),
    }),
    compute: ({ session }, _params, ctx) => toSessionVM(session, ctx.locale),
  }),
}
