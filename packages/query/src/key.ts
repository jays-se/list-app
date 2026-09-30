import { stableHash } from "@app/protocol"
import type { QueryKey } from "./types.ts"

export function hashKey(key: QueryKey): string {
  return stableHash(key)
}

/** True when `prefix` equals the first `prefix.length` elements of `key`. */
export function matchKey(prefix: QueryKey, key: QueryKey): boolean {
  if (prefix.length > key.length) return false
  for (let i = 0; i < prefix.length; i++) {
    if (stableHash(prefix[i]) !== stableHash(key[i])) return false
  }
  return true
}
