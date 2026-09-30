// Generates packages/ui-kit/src/styles/tokens.css from the TS token source.
// Usage: node packages/ui-kit/scripts/build-tokens.ts [--check]
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { renderTokensCss } from "../src/tokens/css.ts"

const out = join(
  dirname(fileURLToPath(import.meta.url)),
  "../src/styles/tokens.css"
)
const css = renderTokensCss()
let current = ""
try {
  current = readFileSync(out, "utf8")
} catch {}

if (process.argv.includes("--check")) {
  if (current !== css) {
    console.error("tokens.css is stale. Run: pnpm tokens")
    process.exit(1)
  }
  console.log("tokens.css is up to date.")
} else if (current !== css) {
  writeFileSync(out, css)
  console.log("Wrote tokens.css")
}
