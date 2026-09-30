import type { MemberList } from "@app/api-client"
import type { MembersVM } from "@app/protocol"
import { ROLE_LABEL } from "../session/session.vm.ts"

export function toMembersVM(
  list: MemberList,
  currentUserId: string | null,
  locale: string,
  isOwner = false
): MembersVM {
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium" })
  const count = list.members.length
  return {
    countText: `${count} ${count === 1 ? "member" : "members"}`,
    canManage: isOwner,
    roleOptions: [
      { value: "OWNER", label: ROLE_LABEL.OWNER },
      { value: "MEMBER", label: ROLE_LABEL.MEMBER },
    ],
    members: list.members.map((m) => ({
      id: m.id,
      name: m.name,
      email: m.email,
      image: m.image,
      roleLabel: ROLE_LABEL[m.role],
      isOwner: m.role === "OWNER",
      isYou: m.id === currentUserId,
      joinedText: `Joined ${date.format(new Date(m.joinedAt))}`,
      role: m.role,
      canChangeRole: isOwner && m.id !== currentUserId,
      canRemove: isOwner && m.id !== currentUserId,
    })),
  }
}
