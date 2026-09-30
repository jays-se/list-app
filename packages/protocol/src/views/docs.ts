/** Docs views (E11). Markdown arrives as a safe AST; React never sees HTML. */
import type { AttachmentVM, LabelColorKey, OptionVM } from "./tasks.ts"

export type MdInline =
  | { t: "text"; v: string }
  | { t: "code"; v: string }
  | { t: "strong" | "em" | "del"; c: MdInline[] }
  /** `href` is always http(s): or mailto: (ADR-0025). */
  | { t: "link"; href: string; c: MdInline[] }

export type MdBlock =
  | { t: "h"; level: 1 | 2 | 3 | 4 | 5 | 6; c: MdInline[] }
  | { t: "p"; c: MdInline[] }
  | { t: "ul"; items: MdBlock[][] }
  | { t: "ol"; start: number; items: MdBlock[][] }
  | { t: "quote"; c: MdBlock[] }
  | { t: "code"; lang: string; v: string }
  | { t: "hr" }

export interface DocRowVM {
  id: string
  title: string
  /** Plain text from the start of the doc, markdown removed. */
  excerpt: string
  /** e.g. "Edited 5 min ago by Grace". */
  metaText: string
  client: { name: string; color: LabelColorKey } | null
  fileCountText: string | null
}

export interface DocsVM {
  docs: DocRowVM[]
  countText: string
  isEmpty: boolean
  emptyText: string
}

export type DocSaveState = "saved" | "unsaved" | "saving" | "error" | "conflict"

export interface DocDetailVM {
  id: string
  /**
   * Changes only when the shown text didn't come from this editor (first
   * load, a teammate's version before any local edit, reload): the page
   * remounts its uncontrolled inputs on change.
   */
  editorKey: string
  /** Current values: the local draft if there is one. */
  title: string
  content: string
  clientId: string
  blocks: MdBlock[]
  saveState: DocSaveState
  /** e.g. "Saved", "Saving…", "Unsaved changes", "Couldn't save: …". */
  saveText: string
  /** True unless everything is saved; the page warns before leaving. */
  hasPendingChanges: boolean
  wordCountText: string
  metaText: string
  clientOptions: OptionVM[]
  files: AttachmentVM[]
  filesText: string
  canAttach: boolean
  canDelete: boolean
}
