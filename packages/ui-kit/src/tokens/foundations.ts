/**
 * Non-colour foundations (ADR-0014): 4px spacing grid, type ramp, radii,
 * strokes, motion. Values follow Fluent 2's published scale; names are ours.
 */

export const spacing = {
  spacingNone: "0",
  spacingXXS: "2px",
  spacingXS: "4px",
  spacingSNudge: "6px",
  spacingS: "8px",
  spacingMNudge: "10px",
  spacingM: "12px",
  spacingL: "16px",
  spacingXL: "20px",
  spacingXXL: "24px",
  spacingXXXL: "32px",
} as const

export const typography = {
  fontFamilyBase:
    '"Segoe UI", -apple-system, BlinkMacSystemFont, system-ui, "Helvetica Neue", Roboto, sans-serif',
  fontFamilyMonospace:
    'ui-monospace, "Cascadia Code", "SF Mono", Menlo, Consolas, monospace',
  fontSizeBase100: "10px",
  fontSizeBase200: "12px",
  fontSizeBase300: "14px",
  fontSizeBase400: "16px",
  fontSizeBase500: "20px",
  fontSizeBase600: "24px",
  fontSizeHero700: "28px",
  fontSizeHero800: "32px",
  fontSizeHero900: "40px",
  lineHeightBase100: "14px",
  lineHeightBase200: "16px",
  lineHeightBase300: "20px",
  lineHeightBase400: "22px",
  lineHeightBase500: "28px",
  lineHeightBase600: "32px",
  lineHeightHero700: "36px",
  lineHeightHero800: "40px",
  lineHeightHero900: "52px",
  fontWeightRegular: "400",
  fontWeightMedium: "500",
  fontWeightSemibold: "600",
  fontWeightBold: "700",
} as const

export const radius = {
  borderRadiusNone: "0",
  borderRadiusSmall: "2px",
  borderRadiusMedium: "4px",
  borderRadiusLarge: "6px",
  borderRadiusXLarge: "8px",
  borderRadiusCircular: "10000px",
} as const

export const stroke = {
  strokeWidthThin: "1px",
  strokeWidthThick: "2px",
  strokeWidthThicker: "3px",
} as const

export const motion = {
  durationUltraFast: "50ms",
  durationFaster: "100ms",
  durationFast: "150ms",
  durationNormal: "200ms",
  durationGentle: "250ms",
  durationSlow: "300ms",
  durationSlower: "400ms",
  curveEasyEase: "cubic-bezier(0.33, 0, 0.67, 1)",
  curveDecelerateMid: "cubic-bezier(0, 0, 0, 1)",
  curveAccelerateMid: "cubic-bezier(1, 0, 1, 1)",
} as const

/** Elevation: ambient + key shadow pairs, stronger in dark. */
function shadow(blur: number, y: number, ambient: number, key: number) {
  return `0 0 2px rgba(0,0,0,${ambient}), 0 ${y}px ${blur}px rgba(0,0,0,${key})`
}

const levels = [
  ["shadow2", 2, 1],
  ["shadow4", 4, 2],
  ["shadow8", 8, 4],
  ["shadow16", 16, 8],
  ["shadow28", 28, 14],
  ["shadow64", 64, 32],
] as const

export const lightShadows = Object.fromEntries(
  levels.map(([name, blur, y]) => [name, shadow(blur, y, 0.12, 0.14)])
) as Record<(typeof levels)[number][0], string>

export const darkShadows = Object.fromEntries(
  levels.map(([name, blur, y]) => [name, shadow(blur, y, 0.24, 0.28)])
) as Record<(typeof levels)[number][0], string>

export const foundations = {
  ...spacing,
  ...typography,
  ...radius,
  ...stroke,
  ...motion,
}
