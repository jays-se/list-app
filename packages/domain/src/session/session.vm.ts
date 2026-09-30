import type { Role } from "@app/api-client"
import type { SessionVM } from "@app/protocol"
import type { SessionDto } from "./session.queries.ts"

export const ROLE_LABEL: Record<Role, string> = {
  OWNER: "Owner",
  MEMBER: "Member",
}

export function toSessionVM(dto: SessionDto, locale: string): SessionVM {
  if (!dto.user) {
    return {
      status: "anonymous",
      user: null,
      activeWorkspace: null,
      workspaces: [],
    }
  }
  const active = dto.workspaces.active
  const collator = new Intl.Collator(locale, { sensitivity: "base" })
  return {
    status: active ? "ready" : "needsWorkspace",
    user: {
      ...dto.user,
      firstName: dto.user.name.trim().split(/\s+/)[0] ?? "",
    },
    activeWorkspace: active && {
      id: active.id,
      name: active.name,
      isOwner: active.role === "OWNER",
      roleLabel: ROLE_LABEL[active.role],
      inviteCode: active.inviteCode,
    },
    workspaces: [...dto.workspaces.workspaces]
      .sort((a, b) => collator.compare(a.name, b.name))
      .map((w) => ({
        id: w.id,
        name: w.name,
        roleLabel: ROLE_LABEL[w.role],
        isActive: w.id === active?.id,
      })),
  }
}
