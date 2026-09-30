/** `session.current` - who is signed in and which workspace is active. */
export type SessionStatus = "anonymous" | "needsWorkspace" | "ready"

export interface SessionUserVM {
  id: string
  name: string
  /** For greetings: the first word of the name. */
  firstName: string
  email: string
  image: string | null
}

export interface ActiveWorkspaceVM {
  id: string
  name: string
  isOwner: boolean
  roleLabel: string
  inviteCode: string
}

export interface WorkspaceOptionVM {
  id: string
  name: string
  roleLabel: string
  isActive: boolean
}

export interface SessionVM {
  status: SessionStatus
  user: SessionUserVM | null
  activeWorkspace: ActiveWorkspaceVM | null
  /** Sorted for display; empty when anonymous. */
  workspaces: WorkspaceOptionVM[]
}

/** `workspace.members` - members of the active workspace. */
export interface MemberVM {
  id: string
  name: string
  email: string
  image: string | null
  roleLabel: string
  isOwner: boolean
  isYou: boolean
  joinedText: string
  role: "OWNER" | "MEMBER"
  /** Workspace owners manage others (E3-S6); nobody manages themselves here. */
  canChangeRole: boolean
  canRemove: boolean
}

export interface MembersVM {
  members: MemberVM[]
  countText: string
  canManage: boolean
  roleOptions: { value: "OWNER" | "MEMBER"; label: string }[]
}

export interface WorkspaceRefVM {
  id: string
  name: string
}
