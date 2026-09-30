import { describe, expect, it } from "vitest"
import { formatDuration } from "../shared/format.ts"
import { toSystemInfoVM } from "./system.vm.ts"

describe("formatDuration", () => {
  it.each([
    [0, "0s"],
    [45_000, "45s"],
    [192_000, "3m 12s"],
    [7_500_000, "2h 5m"],
    [356_400_000, "4d 3h"],
    [3_600_000, "1h"],
    [-5, "0s"],
  ])("%d ms → %s", (ms, text) => {
    expect(formatDuration(ms)).toBe(text)
  })
})

describe("toSystemInfoVM", () => {
  it("builds a display-ready view model", () => {
    const startedAt = "2026-09-30T10:00:00.000Z"
    const vm = toSystemInfoVM(
      { service: "list-api", version: "0.1.0", startedAt },
      Date.parse(startedAt) + 192_000,
      "en-GB"
    )
    expect(vm).toMatchObject({
      service: "list-api",
      version: "0.1.0",
      uptimeText: "3m 12s",
    })
    expect(vm.startedAtText).toContain("2026")
  })
})
