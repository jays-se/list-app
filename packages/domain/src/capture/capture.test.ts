import { describe, expect, it } from "vitest"
import { parseLines } from "./capture.ts"

describe("capture parser (reference rules)", () => {
  it("strips bullets and numbering, trims, and drops blank lines", () => {
    const text = [
      "- Call the vendor",
      "* Send the deck ",
      "• Book a room",
      "1. First item",
      "2) Second item",
      "",
      "   ",
      "Plain line",
      "1.5 kg of rice",
      "--- double dash",
      "",
    ].join("\n")
    expect(parseLines(text)).toEqual({
      lines: [
        "Call the vendor",
        "Send the deck",
        "Book a room",
        "First item",
        "Second item",
        "Plain line",
        "1.5 kg of rice",
        "double dash",
      ],
      empty: 2,
      total: 11,
    })
  })

  it("handles Windows newlines and bare markers", () => {
    expect(parseLines("a\r\nb\rc\n-\n3.")).toMatchObject({
      lines: ["a", "b", "c"],
      empty: 2,
    })
    expect(parseLines("")).toMatchObject({ lines: [], empty: 1 })
  })
})
