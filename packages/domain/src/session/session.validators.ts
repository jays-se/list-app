import type { FieldError } from "@app/protocol"

/** Mirrors the API (workspacesvc.ValidateName) and the DB CHECK. */
export function validateWorkspaceName(name: string): FieldError[] {
  const trimmed = name.trim()
  if (trimmed.length === 0) {
    return [{ field: "name", message: "Workspace name is required" }]
  }
  if ([...trimmed].length > 100) {
    return [
      {
        field: "name",
        message: "Workspace name must be 100 characters or fewer",
      },
    ]
  }
  return []
}

export function validateInviteCode(code: string): FieldError[] {
  return code.trim()
    ? []
    : [{ field: "inviteCode", message: "Invite code is required" }]
}
