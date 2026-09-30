import {
  type ApiClient,
  decodeMemberList,
  type MemberList,
} from "@app/api-client"
import type { QueryOptions } from "@app/query"

export const workspaceKeys = {
  all: ["workspace"] as const,
  members: ["workspace", "members"] as const,
}

export function membersQuery(api: ApiClient): QueryOptions<MemberList> {
  return {
    key: workspaceKeys.members,
    ttl: 60_000,
    fetcher: async ({ signal }) =>
      decodeMemberList(
        await api.get("/workspaces/current/members", { signal })
      ),
  }
}
