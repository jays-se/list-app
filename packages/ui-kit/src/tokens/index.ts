import {
  type ColorTokenName,
  colorTokenNames,
  paletteTokenNames,
} from "./alias.ts"
import {
  foundations,
  lightShadows,
  motion,
  radius,
  spacing,
  stroke,
  typography,
} from "./foundations.ts"

export type { ColorTheme, ColorTokenName } from "./alias.ts"
export {
  colorTokenNames,
  darkColors,
  highContrastColors,
  lightColors,
  type PaletteKey,
  paletteKeys,
  paletteTokenNames,
} from "./alias.ts"

type TokenName =
  | ColorTokenName
  | keyof typeof foundations
  | keyof typeof lightShadows

/** `tokens.colorBrandBackground` → `"var(--colorBrandBackground)"`. */
export const tokens = Object.fromEntries(
  [
    ...colorTokenNames,
    ...paletteTokenNames,
    ...Object.keys(foundations),
    ...Object.keys(lightShadows),
  ].map((name) => [name, `var(--${name})`])
) as Record<TokenName, string>

/** Token names grouped for documentation (the /_design gallery). */
export const tokenGroups = {
  color: [...colorTokenNames, ...paletteTokenNames] as ColorTokenName[],
  spacing: Object.keys(spacing) as (keyof typeof spacing)[],
  typography: Object.keys(typography) as (keyof typeof typography)[],
  radius: Object.keys(radius) as (keyof typeof radius)[],
  stroke: Object.keys(stroke) as (keyof typeof stroke)[],
  motion: Object.keys(motion) as (keyof typeof motion)[],
  shadow: Object.keys(lightShadows) as (keyof typeof lightShadows)[],
}
