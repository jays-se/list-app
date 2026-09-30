import { defineView } from "../runtime.ts"
import { systemInfoQuery } from "./system.queries.ts"
import { toSystemInfoVM } from "./system.vm.ts"

export const systemViews = {
  "system.info": defineView({
    queries: (_params: Record<string, never>, ctx) => ({
      info: systemInfoQuery(ctx.api),
    }),
    compute: ({ info }, _params, ctx) =>
      toSystemInfoVM(info, ctx.now(), ctx.locale),
  }),
}
