#!/usr/bin/env node
// Enforces the render-only / worker-owned data plane boundaries (ADR-0005).
// Complements Biome's noRestrictedImports/noRestrictedGlobals with rules
// Biome can't express (package-direction, DOM-in-worker, file size).
// Usage: node scripts/check-boundaries.mjs   (exit 1 on violation)
import fs from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "..")
const MAX_LINES = 500

const MAIN_ZONES = [
  "apps/web/src",
  "packages/bridge/src",
  "packages/ui-kit/src",
]
const WORKER_ZONES = [
  "packages/protocol/src",
  "packages/query/src",
  "packages/api-client/src",
  "packages/domain/src",
  "packages/worker/src",
]

const rules = [
  {
    zones: MAIN_ZONES,
    skip: (f) => f.endsWith(".worker.ts") || /\.test\.tsx?$/.test(f),
    pattern:
      /from\s+["']@app\/(query|api-client|domain|worker)(\/[^"']*)?["']|import\s+["']@app\/(query|api-client|domain|worker)/,
    message:
      "main-thread code must not import worker packages; use @app/bridge",
  },
  {
    zones: MAIN_ZONES,
    skip: (f) => /\.test\.tsx?$/.test(f),
    pattern:
      /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\s*\(|new\s+(XMLHttpRequest|WebSocket|EventSource)\b/,
    message: "network calls belong in the worker (ADR-0005)",
  },
  {
    zones: ["packages/ui-kit/src"],
    skip: () => false,
    pattern: /from\s+["']@app\/(bridge|protocol)["']/,
    message: "ui-kit is presentational; it must not import data packages",
  },
  {
    zones: WORKER_ZONES,
    skip: (f) => /\.test\.tsx?$/.test(f),
    pattern: /from\s+["']react(-dom)?["']|\b(window|document)\./,
    message: "worker packages must not use React or the DOM",
  },
  {
    zones: ["packages/query/src", "packages/protocol/src"],
    skip: () => false,
    pattern: /from\s+["']@app\/(domain|worker|bridge|api-client|ui-kit)["']/,
    message:
      "query/protocol are foundational and must not depend on app packages",
  },
]

function* files(dir) {
  const abs = path.join(root, dir)
  if (!fs.existsSync(abs)) return
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name)
    if (entry.isDirectory()) yield* files(rel)
    else if (/\.(ts|tsx)$/.test(entry.name)) yield rel
  }
}

const violations = []
const seen = new Set()
for (const rule of rules) {
  for (const zone of rule.zones) {
    for (const file of files(zone)) {
      const lines = fs.readFileSync(path.join(root, file), "utf8").split("\n")
      if (!seen.has(file)) {
        seen.add(file)
        if (lines.length > MAX_LINES) {
          violations.push(`${file}: ${lines.length} lines (max ${MAX_LINES})`)
        }
      }
      if (rule.skip(file)) continue
      lines.forEach((line, i) => {
        const code = line.replace(/\/\/.*$/, "")
        if (rule.pattern.test(code)) {
          violations.push(
            `${file}:${i + 1}: ${rule.message}\n    ${line.trim()}`
          )
        }
      })
    }
  }
}

if (violations.length) {
  console.error(`Boundary violations (${violations.length}):`)
  for (const v of violations) console.error(`  ${v}`)
  process.exit(1)
}
console.log(`Boundaries OK (${seen.size} files checked).`)
