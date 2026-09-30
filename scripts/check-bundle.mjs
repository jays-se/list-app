#!/usr/bin/env node
/**
 * Bundle budgets (E12-S3, ADR-0025). Run after `pnpm build`:
 * fails when a gzipped asset is over its budget.
 */
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { gzipSync } from "node:zlib"

const dist = new URL("../apps/web/dist/", import.meta.url).pathname
const assets = join(dist, "assets")
const KB = 1024
const budgets = [
  { name: "main entry JS", match: /^index-.*\.js$/, max: 150 * KB },
  {
    name: "data-plane worker JS",
    match: /^data-plane\.worker-.*\.js$/,
    max: 60 * KB,
  },
  { name: "CSS", match: /\.css$/, max: 20 * KB },
]

let files
try {
  files = readdirSync(assets)
} catch {
  console.error("apps/web/dist/assets not found: run `pnpm build` first.")
  process.exit(1)
}

let failed = false
for (const b of budgets) {
  const hits = files.filter((f) => b.match.test(f))
  if (hits.length === 0) {
    console.error(`✗ ${b.name}: no file matches ${b.match}`)
    failed = true
    continue
  }
  const size = hits.reduce(
    (n, f) => n + gzipSync(readFileSync(join(assets, f))).length,
    0
  )
  const ok = size <= b.max
  failed ||= !ok
  console.log(
    `${ok ? "✓" : "✗"} ${b.name}: ${(size / KB).toFixed(1)} KB gzipped (budget ${b.max / KB} KB)`
  )
}
process.exit(failed ? 1 : 0)
