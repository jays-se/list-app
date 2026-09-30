/**
 * Global tokens: raw ramps (ADR-0014, Fluent 2 token architecture).
 * Components never use these directly — only alias tokens (./alias.ts).
 */

/** Neutral grey where `n` is lightness 0–100 (Fluent-style grey[n]). */
export function grey(n: number): string {
  const v = Math.round((n / 100) * 255)
    .toString(16)
    .padStart(2, "0")
  return `#${v}${v}${v}`
}

/**
 * Brand ramp, 16 steps (10 darkest → 160 lightest). PLACEHOLDER indigo until
 * a brand colour is chosen (open item). Step 80 is the primary.
 * White on brand80 ≈ 6:1 contrast.
 */
export const brand = {
  10: "#0a0b24",
  20: "#121538",
  30: "#1a1f52",
  40: "#212a6b",
  50: "#293584",
  60: "#31409c",
  70: "#3a4bb3",
  80: "#4457c8",
  90: "#5a6bd3",
  100: "#6f7fdc",
  110: "#8492e4",
  120: "#99a5ea",
  130: "#adb8f0",
  140: "#c2caf5",
  150: "#d6dcf9",
  160: "#ebeefc",
} as const

/** Status palettes: shade = dark text, primary = mid, tint = light background. */
export const status = {
  danger: {
    shade: "#8a1c1c",
    primary: "#c42b2b",
    tint: "#fdecec",
    darkTint: "#3b1414",
    darkFg: "#f1a1a1",
  },
  warning: {
    shade: "#7a4a00",
    primary: "#b86e00",
    tint: "#fff4e0",
    darkTint: "#3a2a0c",
    darkFg: "#f5c26b",
  },
  success: {
    shade: "#0f5c2e",
    primary: "#1a7f44",
    tint: "#e6f5ec",
    darkTint: "#10301d",
    darkFg: "#8fd6ab",
  },
  info: {
    shade: "#0b4a78",
    primary: "#1668a8",
    tint: "#e7f1fa",
    darkTint: "#0f2a40",
    darkFg: "#8ec3ec",
  },
} as const
