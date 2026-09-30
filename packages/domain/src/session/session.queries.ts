import {
  type ApiClient,
  AppError,
  decodeMeResponse,
  decodeWorkspaceList,
  type User,
  type WorkspaceList,
} from "@app/api-client"
import type { QueryOptions } from "@app/query"

/** Signed out: user is null. Signed in: user plus workspace list. */
export type SessionDto =
  | { user: null; workspaces: null }
  | { user: User; workspaces: WorkspaceList }

export const sessionKeys = {
  all: ["session"] as const,
  current: ["session", "current"] as const,
}

/**
 * One query for "who am I and where": a 401 from /auth/me is the normal
 * signed-out answer, not a session expiry (ADR-0019).
 */
export function sessionQuery(api: ApiClient): QueryOptions<SessionDto> {
  return {
    key: sessionKeys.current,
    ttl: 5 * 60_000,
    fetcher: async ({ signal }) => {
      let user: User
      try {
        const me = await api.get("/auth/me", { signal, skipAuthRedirect: true })
        user = decodeMeResponse(me).user
      } catch (error) {
        if (error instanceof AppError && error.status === 401) {
          return { user: null, workspaces: null }
        }
        throw error
      }
      const workspaces = decodeWorkspaceList(
        await api.get("/workspaces", { signal })
      )
      return { user, workspaces }
    },
  }
}
