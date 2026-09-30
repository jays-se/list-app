import { brand, grey, status } from "./global.ts"

/**
 * Alias (semantic) colour tokens, named by role. Components use only these.
 * Each theme must define every key (enforced by the ColorTheme type).
 */
export const colorTokenNames = [
  "colorNeutralForeground1",
  "colorNeutralForeground2",
  "colorNeutralForeground3",
  "colorNeutralForegroundDisabled",
  "colorNeutralForegroundOnBrand",
  "colorNeutralBackground1",
  "colorNeutralBackground1Hover",
  "colorNeutralBackground1Pressed",
  "colorNeutralBackground2",
  "colorNeutralBackground3",
  "colorNeutralBackgroundDisabled",
  "colorSubtleBackgroundHover",
  "colorSubtleBackgroundPressed",
  "colorNeutralStroke1",
  "colorNeutralStroke1Hover",
  "colorNeutralStroke2",
  "colorNeutralStrokeAccessible",
  "colorNeutralStrokeDisabled",
  "colorBrandBackground",
  "colorBrandBackgroundHover",
  "colorBrandBackgroundPressed",
  "colorBrandBackground2",
  "colorBrandForeground1",
  "colorBrandForeground2",
  "colorBrandStroke1",
  "colorStrokeFocus1",
  "colorStrokeFocus2",
  "colorStatusDangerForeground1",
  "colorStatusDangerBackground1",
  "colorStatusDangerBorder1",
  "colorStatusWarningForeground1",
  "colorStatusWarningBackground1",
  "colorStatusWarningBorder1",
  "colorStatusSuccessForeground1",
  "colorStatusSuccessBackground1",
  "colorStatusSuccessBorder1",
  "colorStatusInfoForeground1",
  "colorStatusInfoBackground1",
  "colorStatusInfoBorder1",
  "colorBackgroundOverlay",
  "colorNeutralBackgroundStrong",
  "colorStatusDangerBackground3",
  "colorStatusWarningBackground3",
  "colorStatusSuccessBackground3",
  "colorStatusInfoBackground3",
] as const

export const paletteKeys = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "purple",
  "pink",
] as const
export type PaletteKey = (typeof paletteKeys)[number]
type PaletteRole = "Background2" | "Foreground2" | "BorderActive"
export type PaletteTokenName =
  `colorPalette${Capitalize<PaletteKey>}${PaletteRole}`

const cap = <K extends PaletteKey>(k: K) =>
  (k[0]?.toUpperCase() + k.slice(1)) as Capitalize<K>
export const paletteTokenNames: PaletteTokenName[] = paletteKeys.flatMap((k) =>
  (["Background2", "Foreground2", "BorderActive"] as const).map(
    (role) => `colorPalette${cap(k)}${role}` as PaletteTokenName
  )
)

export type ColorTokenName = (typeof colorTokenNames)[number] | PaletteTokenName
export type ColorTheme = Record<ColorTokenName, string>

/** Label palette: [tint background, text, swatch/border] per key (ADR-0014). */
type Triple = readonly [bg: string, fg: string, border: string]
const lightPalette: Record<PaletteKey, Triple> = {
  gray: ["#f0f0f0", "#424242", "#707070"],
  red: ["#fdecec", "#a4262c", "#d13438"],
  orange: ["#fdf1e7", "#8a3707", "#da3b01"],
  yellow: ["#fef7d8", "#6d5700", "#c19c00"],
  green: ["#e7f4e4", "#0e5c1c", "#107c10"],
  teal: ["#e3f5f4", "#00555a", "#038387"],
  blue: ["#e5f0fb", "#0b4a8a", "#0f6cbd"],
  purple: ["#f1eafa", "#5a2690", "#8764b8"],
  pink: ["#fbe9f4", "#8b1c5c", "#c239b3"],
}
const darkPalette: Record<PaletteKey, Triple> = {
  gray: ["#333333", "#d6d6d6", "#9e9e9e"],
  red: ["#3d1a1c", "#f1a9ab", "#e37d80"],
  orange: ["#3d2414", "#f7b98f", "#f4a266"],
  yellow: ["#3a3212", "#f2d97a", "#e9c46a"],
  green: ["#16311b", "#9fd89f", "#54b054"],
  teal: ["#0f3133", "#8fd6d9", "#4bb4b7"],
  blue: ["#142c47", "#a4c8f0", "#5ea2e8"],
  purple: ["#2c2140", "#cbb6ee", "#a585d8"],
  pink: ["#3a1a31", "#eeaad9", "#e07bc6"],
}

function palette(
  p: Record<PaletteKey, Triple> | "hc"
): Record<PaletteTokenName, string> {
  const out = {} as Record<PaletteTokenName, string>
  for (const k of paletteKeys) {
    const [bg, fg, border] =
      p === "hc" ? ["Canvas", "CanvasText", "CanvasText"] : p[k]
    out[`colorPalette${cap(k)}Background2`] = bg
    out[`colorPalette${cap(k)}Foreground2`] = fg
    out[`colorPalette${cap(k)}BorderActive`] = border
  }
  return out
}

export const lightColors: ColorTheme = {
  ...palette(lightPalette),
  colorNeutralForeground1: grey(14),
  colorNeutralForeground2: grey(26),
  colorNeutralForeground3: grey(38),
  colorNeutralForegroundDisabled: grey(74),
  colorNeutralForegroundOnBrand: "#ffffff",
  colorNeutralBackground1: "#ffffff",
  colorNeutralBackground1Hover: grey(96),
  colorNeutralBackground1Pressed: grey(88),
  colorNeutralBackground2: grey(98),
  colorNeutralBackground3: grey(96),
  colorNeutralBackgroundDisabled: grey(94),
  colorSubtleBackgroundHover: grey(96),
  colorSubtleBackgroundPressed: grey(88),
  colorNeutralStroke1: grey(82),
  colorNeutralStroke1Hover: grey(78),
  colorNeutralStroke2: grey(88),
  colorNeutralStrokeAccessible: grey(38),
  colorNeutralStrokeDisabled: grey(88),
  colorBrandBackground: brand[80],
  colorBrandBackgroundHover: brand[70],
  colorBrandBackgroundPressed: brand[40],
  colorBrandBackground2: brand[160],
  colorBrandForeground1: brand[80],
  colorBrandForeground2: brand[70],
  colorBrandStroke1: brand[80],
  colorStrokeFocus1: "#ffffff",
  colorStrokeFocus2: "#000000",
  colorStatusDangerForeground1: status.danger.shade,
  colorStatusDangerBackground1: status.danger.tint,
  colorStatusDangerBorder1: status.danger.primary,
  colorStatusWarningForeground1: status.warning.shade,
  colorStatusWarningBackground1: status.warning.tint,
  colorStatusWarningBorder1: status.warning.primary,
  colorStatusSuccessForeground1: status.success.shade,
  colorStatusSuccessBackground1: status.success.tint,
  colorStatusSuccessBorder1: status.success.primary,
  colorStatusInfoForeground1: status.info.shade,
  colorStatusInfoBackground1: status.info.tint,
  colorStatusInfoBorder1: status.info.primary,
  colorBackgroundOverlay: "rgba(0, 0, 0, 0.4)",
  colorNeutralBackgroundStrong: grey(38),
  colorStatusDangerBackground3: status.danger.primary,
  colorStatusWarningBackground3: status.warning.shade,
  colorStatusSuccessBackground3: status.success.primary,
  colorStatusInfoBackground3: status.info.primary,
}

export const darkColors: ColorTheme = {
  ...palette(darkPalette),
  colorNeutralForeground1: "#ffffff",
  colorNeutralForeground2: grey(84),
  colorNeutralForeground3: grey(68),
  colorNeutralForegroundDisabled: grey(36),
  colorNeutralForegroundOnBrand: "#ffffff",
  colorNeutralBackground1: grey(16),
  colorNeutralBackground1Hover: grey(24),
  colorNeutralBackground1Pressed: grey(12),
  colorNeutralBackground2: grey(12),
  colorNeutralBackground3: grey(8),
  colorNeutralBackgroundDisabled: grey(8),
  colorSubtleBackgroundHover: grey(22),
  colorSubtleBackgroundPressed: grey(18),
  colorNeutralStroke1: grey(40),
  colorNeutralStroke1Hover: grey(46),
  colorNeutralStroke2: grey(32),
  colorNeutralStrokeAccessible: grey(68),
  colorNeutralStrokeDisabled: grey(26),
  colorBrandBackground: brand[70],
  colorBrandBackgroundHover: brand[80],
  colorBrandBackgroundPressed: brand[40],
  colorBrandBackground2: brand[20],
  colorBrandForeground1: brand[110],
  colorBrandForeground2: brand[120],
  colorBrandStroke1: brand[100],
  colorStrokeFocus1: "#000000",
  colorStrokeFocus2: "#ffffff",
  colorStatusDangerForeground1: status.danger.darkFg,
  colorStatusDangerBackground1: status.danger.darkTint,
  colorStatusDangerBorder1: status.danger.primary,
  colorStatusWarningForeground1: status.warning.darkFg,
  colorStatusWarningBackground1: status.warning.darkTint,
  colorStatusWarningBorder1: status.warning.primary,
  colorStatusSuccessForeground1: status.success.darkFg,
  colorStatusSuccessBackground1: status.success.darkTint,
  colorStatusSuccessBorder1: status.success.primary,
  colorStatusInfoForeground1: status.info.darkFg,
  colorStatusInfoBackground1: status.info.darkTint,
  colorStatusInfoBorder1: status.info.primary,
  colorBackgroundOverlay: "rgba(0, 0, 0, 0.6)",
  colorNeutralBackgroundStrong: grey(38),
  colorStatusDangerBackground3: status.danger.primary,
  colorStatusWarningBackground3: status.warning.shade,
  colorStatusSuccessBackground3: status.success.primary,
  colorStatusInfoBackground3: status.info.primary,
}

/** High contrast maps roles to CSS system colours (forced-colors friendly). */
export const highContrastColors: ColorTheme = {
  ...palette("hc"),
  colorNeutralForeground1: "CanvasText",
  colorNeutralForeground2: "CanvasText",
  colorNeutralForeground3: "CanvasText",
  colorNeutralForegroundDisabled: "GrayText",
  colorNeutralForegroundOnBrand: "HighlightText",
  colorNeutralBackground1: "Canvas",
  colorNeutralBackground1Hover: "Canvas",
  colorNeutralBackground1Pressed: "Canvas",
  colorNeutralBackground2: "Canvas",
  colorNeutralBackground3: "Canvas",
  colorNeutralBackgroundDisabled: "Canvas",
  colorSubtleBackgroundHover: "Canvas",
  colorSubtleBackgroundPressed: "Canvas",
  colorNeutralStroke1: "CanvasText",
  colorNeutralStroke1Hover: "Highlight",
  colorNeutralStroke2: "CanvasText",
  colorNeutralStrokeAccessible: "CanvasText",
  colorNeutralStrokeDisabled: "GrayText",
  colorBrandBackground: "Highlight",
  colorBrandBackgroundHover: "Highlight",
  colorBrandBackgroundPressed: "Highlight",
  colorBrandBackground2: "Canvas",
  colorBrandForeground1: "LinkText",
  colorBrandForeground2: "LinkText",
  colorBrandStroke1: "Highlight",
  colorStrokeFocus1: "Canvas",
  colorStrokeFocus2: "Highlight",
  colorStatusDangerForeground1: "CanvasText",
  colorStatusDangerBackground1: "Canvas",
  colorStatusDangerBorder1: "CanvasText",
  colorStatusWarningForeground1: "CanvasText",
  colorStatusWarningBackground1: "Canvas",
  colorStatusWarningBorder1: "CanvasText",
  colorStatusSuccessForeground1: "CanvasText",
  colorStatusSuccessBackground1: "Canvas",
  colorStatusSuccessBorder1: "CanvasText",
  colorStatusInfoForeground1: "CanvasText",
  colorStatusInfoBackground1: "Canvas",
  colorStatusInfoBorder1: "CanvasText",
  colorBackgroundOverlay: "rgba(0, 0, 0, 0.6)",
  colorNeutralBackgroundStrong: "Highlight",
  colorStatusDangerBackground3: "Highlight",
  colorStatusWarningBackground3: "Highlight",
  colorStatusSuccessBackground3: "Highlight",
  colorStatusInfoBackground3: "Highlight",
}
