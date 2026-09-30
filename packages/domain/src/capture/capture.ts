import type { CaptureParseResult, CaptureSource } from "@app/protocol"
import { stableHash } from "@app/protocol"
import { defineAction } from "../runtime.ts"
import { todayISO } from "../shared/dates.ts"
import { validationError } from "../shared/errors.ts"
import { taskKeys } from "../tasks/tasks.queries.ts"

export const MAX_LINES = 100
export const MAX_TITLE = 500

/** Bullets (- * •) and "1." / "1)" numbering, per the reference app. */
const PREFIX = /^\s*(?:[-*•]+\s*|\d+[.)](?:\s+|$))/

export function parseLines(text: string): {
  lines: string[]
  empty: number
  total: number
} {
  const raw = text.split(/\r\n|\r|\n/)
  const lines: string[] = []
  let empty = 0
  for (const line of raw) {
    const clean = line.replace(PREFIX, "").trim()
    if (clean) lines.push(clean)
    else empty++
  }
  // A trailing newline isn't an "empty line" the user would care about.
  if (raw.length > 1 && raw[raw.length - 1]?.trim() === "") empty--
  return { lines, empty: Math.max(0, empty), total: raw.length }
}

let batchSeq = 0
const newBatchId = (now: number) =>
  `cap-${now.toString(36)}-${(++batchSeq).toString(36)}-${Math.random().toString(36).slice(2, 8)}`

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`

export const captureActions = {
  "capture.parse": defineAction(
    async (input: { text: string }, ctx): Promise<CaptureParseResult> => {
      const { lines, empty } = parseLines(input.text)
      const batchId = newBatchId(ctx.now())
      const kept = lines.slice(0, MAX_LINES)
      const parts = [plural(kept.length, "task")]
      if (empty) parts.push(`${plural(empty, "empty line")} skipped`)
      return {
        batchId,
        lines: kept.map((text, i) => ({ id: `${batchId}:${i}`, text })),
        summaryText: parts.join(" · "),
        warning:
          lines.length > MAX_LINES
            ? `Only the first ${MAX_LINES} lines are kept (${lines.length} pasted).`
            : null,
      }
    }
  ),

  /** One POST /tasks/bulk; the key is stable for identical retries. */
  "capture.create": defineAction(
    async (
      input: {
        batchId: string
        source: CaptureSource
        lines: { id: string; text: string }[]
      },
      ctx
    ) => {
      const lines = input.lines.map((l) => ({ ...l, text: l.text.trim() }))
      const errors = lines.flatMap((l) => {
        const n = [...l.text].length
        if (n === 0)
          return [
            { field: l.id, message: "Write something or remove this line" },
          ]
        if (n > MAX_TITLE)
          return [
            { field: l.id, message: `Keep it to ${MAX_TITLE} characters` },
          ]
        return []
      })
      if (lines.length === 0)
        errors.push({ field: "lines", message: "Add at least one line" })
      if (lines.length > MAX_LINES)
        errors.push({
          field: "lines",
          message: `Capture up to ${MAX_LINES} lines at a time`,
        })
      if (errors.length) throw validationError(errors)

      const today = todayISO(ctx.now())
      const body = {
        source: input.source,
        startDate: today,
        endDate: today,
        titles: lines.map((l) => l.text),
      }
      // Same batch + same content → same key, so a retry can't duplicate.
      const key = `${input.batchId}-${hashCode(stableHash(body))}`
      try {
        await ctx.api.post("/tasks/bulk", body, {
          headers: { "Idempotency-Key": key },
        })
      } catch (error) {
        throw remapLineErrors(error, lines)
      }
      await ctx.client.invalidate(taskKeys.lists)
      return { created: lines.length }
    }
  ),
}

function hashCode(s: string): string {
  let h = 0
  for (let i = 0; i < s.length; i++)
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/** Server errors name `titles[i]`; the form knows lines by id. */
function remapLineErrors(error: unknown, lines: { id: string }[]): unknown {
  const e = error as { fieldErrors?: { field: string; message: string }[] }
  if (!e?.fieldErrors?.length) return error
  const mapped = e.fieldErrors.map((f) => {
    const m = /^titles\[(\d+)\]$/.exec(f.field)
    const line = m ? lines[Number(m[1])] : undefined
    return line ? { field: line.id, message: f.message } : f
  })
  return validationError(mapped)
}
