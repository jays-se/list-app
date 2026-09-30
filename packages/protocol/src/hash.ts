/**
 * Deterministic serialization used for query keys, view params and
 * view-model change detection. Object keys are sorted, so `{a,b}` and `{b,a}`
 * hash the same (unlike plain `JSON.stringify`). `undefined` object members
 * are dropped, matching structured-clone/JSON semantics.
 */
export function stableHash(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v === null || typeof v !== "object" || Array.isArray(v)) return v
    const sorted: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) {
      sorted[k] = (v as Record<string, unknown>)[k]
    }
    return sorted
  })
}
