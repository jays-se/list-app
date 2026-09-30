/** Global search (ADR-0026): matched in the worker over cached lists. */
import type { LabelColorKey, Tone } from "./tasks.ts"

export type SearchResultKind = "page" | "task" | "doc" | "client"

export interface SearchResultVM {
  /** Unique within the results (kind + id). */
  key: string
  kind: SearchResultKind
  title: string
  subtitle: string | null
  /** Tasks open in the drawer on the current page. */
  taskId: string | null
  /** Where to go for everything else, e.g. "/docs/abc" or "?create=1". */
  to: string | null
  color: LabelColorKey | null
  tone: Tone | null
}

export interface SearchGroupVM {
  key: "pages" | "tasks" | "docs" | "clients"
  label: string
  /** e.g. "6 of 14". */
  countText: string | null
  items: SearchResultVM[]
}

export interface SearchVM {
  query: string
  groups: SearchGroupVM[]
  /** Every result in display order, for arrow-key navigation. */
  total: number
  isEmpty: boolean
  emptyText: string
}
