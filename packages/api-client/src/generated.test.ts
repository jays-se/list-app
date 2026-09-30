import { describe, expect, it } from "vitest"
import {
  DecodeError,
  decodeMemberList,
  decodeReadiness,
  decodeWorkspaceList,
} from "./generated.ts"

describe("generated decoders", () => {
  it("decodes a valid payload and drops unknown fields", () => {
    const value = decodeWorkspaceList({
      workspaces: [{ id: "w1", name: "Acme", role: "OWNER", extra: 1 }],
      active: { id: "w1", name: "Acme", role: "OWNER", inviteCode: "abc" },
    })
    expect(value).toEqual({
      workspaces: [{ id: "w1", name: "Acme", role: "OWNER" }],
      active: { id: "w1", name: "Acme", role: "OWNER", inviteCode: "abc" },
    })
  })

  it("accepts null for nullable fields", () => {
    expect(
      decodeWorkspaceList({ workspaces: [], active: null }).active
    ).toBeNull()
  })

  it.each([
    [{ workspaces: {}, active: null }, "$.workspaces", "array"],
    [
      { workspaces: [{ id: "w", name: "A", role: "ADMIN" }], active: null },
      "$.workspaces[0].role",
      "OWNER | MEMBER",
    ],
    [{ workspaces: [] }, "$.active", "object"],
  ])("reports the JSON path of a mismatch (%#)", (input, path, expected) => {
    try {
      decodeWorkspaceList(input)
      expect.unreachable()
    } catch (error) {
      expect(error).toBeInstanceOf(DecodeError)
      expect((error as DecodeError).path).toBe(path)
      expect((error as DecodeError).expected).toBe(expected)
    }
  })

  it("decodes records and nested arrays", () => {
    expect(decodeReadiness({ status: "ready", checks: { db: "ok" } })).toEqual({
      status: "ready",
      checks: { db: "ok" },
    })
    expect(() => decodeMemberList({ members: [{ id: 1 }] })).toThrow(
      "$.members[0].id"
    )
  })
})
