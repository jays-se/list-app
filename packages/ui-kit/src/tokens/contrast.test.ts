import { describe, expect, it } from "vitest"
import {
  type ColorTheme,
  type ColorTokenName,
  darkColors,
  lightColors,
} from "./alias.ts"

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}

type Pair = [fg: ColorTokenName, bg: ColorTokenName, min: number]

/** WCAG 2.2 AA: 4.5 for text, 3 for UI component boundaries. */
const pairs: Pair[] = [
  ["colorNeutralForeground1", "colorNeutralBackground1", 4.5],
  ["colorNeutralForeground2", "colorNeutralBackground1", 4.5],
  ["colorNeutralForeground3", "colorNeutralBackground1", 4.5],
  ["colorNeutralForeground1", "colorNeutralBackground2", 4.5],
  ["colorNeutralForegroundOnBrand", "colorBrandBackground", 4.5],
  ["colorNeutralForegroundOnBrand", "colorBrandBackgroundHover", 4.5],
  ["colorBrandForeground1", "colorNeutralBackground1", 4.5],
  ["colorStatusDangerForeground1", "colorStatusDangerBackground1", 4.5],
  ["colorStatusWarningForeground1", "colorStatusWarningBackground1", 4.5],
  ["colorStatusSuccessForeground1", "colorStatusSuccessBackground1", 4.5],
  ["colorStatusInfoForeground1", "colorStatusInfoBackground1", 4.5],
  ["colorNeutralStrokeAccessible", "colorNeutralBackground1", 3],
  ["colorStrokeFocus2", "colorNeutralBackground1", 3],
  // Filled (solid) badges: on-brand white text on solid status backgrounds.
  ["colorNeutralForegroundOnBrand", "colorNeutralBackgroundStrong", 4.5],
  ["colorNeutralForegroundOnBrand", "colorStatusDangerBackground3", 4.5],
  ["colorNeutralForegroundOnBrand", "colorStatusWarningBackground3", 4.5],
  ["colorNeutralForegroundOnBrand", "colorStatusSuccessBackground3", 4.5],
  ["colorNeutralForegroundOnBrand", "colorStatusInfoBackground3", 4.5],
]

describe.each([
  ["light", lightColors],
  ["dark", darkColors],
] as [string, ColorTheme][])("%s theme contrast", (_name, theme) => {
  it.each(pairs)("%s on %s ≥ %d:1", (fg, bg, min) => {
    expect(contrast(theme[fg], theme[bg])).toBeGreaterThanOrEqual(min)
  })
})
