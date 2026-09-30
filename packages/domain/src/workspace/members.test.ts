import { describe, expect, it } from "vitest"
import { toMembersVM } from "./members.vm.ts"

const list = {
  members: [
    {
      id: "u1",
      name: "Ada",
      email: "a@x",
      image: null,
      role: "OWNER" as const,
      joinedAt: "2026-09-01T00:00:00Z",
    },
    {
      id: "u2",
      name: "Bob",
      email: "b@x",
      image: null,
      role: "MEMBER" as const,
      joinedAt: "2026-09-02T00:00:00Z",
    },
  ],
}

describe("members VM", () => {
  it("lets owners manage everyone but themselves", () => {
    const vm = toMembersVM(list, "u1", "en-GB", true)
    expect(vm.canManage).toBe(true)
    expect(vm.members.map((m) => [m.id, m.canChangeRole, m.canRemove])).toEqual(
      [
        ["u1", false, false],
        ["u2", true, true],
      ]
    )
    expect(vm.roleOptions.map((o) => o.label)).toEqual(["Owner", "Member"])
  })

  it("gives members no controls", () => {
    const vm = toMembersVM(list, "u2", "en-GB")
    expect(vm.canManage).toBe(false)
    expect(vm.members.some((m) => m.canRemove || m.canChangeRole)).toBe(false)
    expect(vm.countText).toBe("2 members")
  })
})
