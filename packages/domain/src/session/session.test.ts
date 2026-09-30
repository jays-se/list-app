import { describe, expect, it } from "vitest"
import { toMembersVM } from "../workspace/members.vm.ts"
import type { SessionDto } from "./session.queries.ts"
import {
  validateInviteCode,
  validateWorkspaceName,
} from "./session.validators.ts"
import { toSessionVM } from "./session.vm.ts"

const user = { id: "u1", name: "Ada", email: "ada@x.io", image: null }

describe("toSessionVM", () => {
  it("is anonymous when signed out", () => {
    expect(toSessionVM({ user: null, workspaces: null }, "en")).toEqual({
      status: "anonymous",
      user: null,
      activeWorkspace: null,
      workspaces: [],
    })
  })

  it("needs a workspace when none is active", () => {
    const vm = toSessionVM(
      { user, workspaces: { workspaces: [], active: null } },
      "en"
    )
    expect(vm.status).toBe("needsWorkspace")
    expect(vm.user).toEqual({ ...user, firstName: "Ada" })
  })

  it("is ready with a sorted list, active flag and owner info", () => {
    const dto: SessionDto = {
      user,
      workspaces: {
        workspaces: [
          { id: "b", name: "beta", role: "MEMBER" },
          { id: "a", name: "Acme", role: "OWNER" },
        ],
        active: { id: "b", name: "beta", role: "MEMBER", inviteCode: "code" },
      },
    }
    const vm = toSessionVM(dto, "en")
    expect(vm.status).toBe("ready")
    expect(vm.activeWorkspace).toEqual({
      id: "b",
      name: "beta",
      isOwner: false,
      roleLabel: "Member",
      inviteCode: "code",
    })
    expect(vm.workspaces.map((w) => [w.name, w.isActive, w.roleLabel])).toEqual(
      [
        ["Acme", false, "Owner"],
        ["beta", true, "Member"],
      ]
    )
  })
})

describe("validators", () => {
  it.each([
    ["", "Workspace name is required"],
    ["   ", "Workspace name is required"],
    ["x".repeat(101), "Workspace name must be 100 characters or fewer"],
  ])("rejects workspace name %j", (name, message) => {
    expect(validateWorkspaceName(name)).toEqual([{ field: "name", message }])
  })

  it("accepts 100 characters (counting code points) and trims", () => {
    expect(validateWorkspaceName(` ${"é".repeat(100)} `)).toEqual([])
    expect(validateWorkspaceName("👍".repeat(100))).toEqual([])
  })

  it("requires an invite code", () => {
    expect(validateInviteCode(" ")).toHaveLength(1)
    expect(validateInviteCode("abc")).toEqual([])
  })
})

describe("toMembersVM", () => {
  it("labels roles, marks you, formats dates and counts", () => {
    const vm = toMembersVM(
      {
        members: [
          {
            id: "u1",
            name: "Ada",
            email: "a@x.io",
            image: null,
            role: "OWNER",
            joinedAt: "2026-09-30T10:00:00Z",
          },
        ],
      },
      "u1",
      "en-GB"
    )
    expect(vm.countText).toBe("1 member")
    expect(vm.members[0]).toMatchObject({
      roleLabel: "Owner",
      isOwner: true,
      isYou: true,
      joinedText: "Joined 30 Sept 2026",
    })
  })
})
