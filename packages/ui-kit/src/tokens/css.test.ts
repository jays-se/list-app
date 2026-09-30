import { describe, expect, it } from "vitest"
import { colorTokenNames, paletteTokenNames } from "./alias.ts"
import { renderTokensCss } from "./css.ts"
import { tokens } from "./index.ts"

const css = renderTokensCss()

// Committed tokens.css == renderTokensCss() is enforced by `pnpm check:tokens`
// (Vitest returns CSS imports empty, so it is not asserted here).
describe("renderTokensCss", () => {
  it("defines every alias colour in each theme block", () => {
    for (const selector of [
      ':root[data-theme="dark"]',
      ':root[data-theme="hc"]',
      ':root[data-theme="light"]',
    ]) {
      const start = css.indexOf(selector)
      const block = css.slice(start, css.indexOf("}", start))
      for (const name of [...colorTokenNames, ...paletteTokenNames]) {
        expect(block).toContain(`--${name}:`)
      }
    }
  })

  it("follows the OS setting when no theme is chosen and honours reduced motion", () => {
    expect(css).toContain("@media (prefers-color-scheme: dark)")
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*--durationNormal: 0ms/)
  })

  it("exposes tokens as var() references", () => {
    expect(tokens.colorBrandBackground).toBe("var(--colorBrandBackground)")
    expect(tokens.spacingM).toBe("var(--spacingM)")
    expect(tokens.shadow4).toBe("var(--shadow4)")
  })
})
