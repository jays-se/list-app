import type { MdBlock, MdInline } from "@app/protocol"

/**
 * In-house markdown → safe AST (ADR-0011, ADR-0025). Supported: ATX
 * headings, paragraphs, - * + and 1. / 1) lists (nested by indentation),
 * > quotes, ``` / ~~~ fences, --- rules; inline **strong**, *em*, ~~del~~,
 * `code`, [links](url), <https://autolinks>. Raw HTML stays text. Links are
 * kept only for http(s): and mailto:; images become links.
 */

const MAX_DEPTH = 8
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+-]*)\s*$/
const HEADING = /^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/
const RULE = /^ {0,3}([-*_])(?:\s*\1){2,}\s*$/
const QUOTE = /^ {0,3}> ?/
const ITEM = /^(\s*)([-*+]|\d{1,9}[.)])(?:\s+(.*)|\s*$)/

export function parseMarkdown(source: string): MdBlock[] {
  return blocks(source.replace(/\r\n?/g, "\n").split("\n"), 0)
}

const indentOf = (line: string) =>
  (/^\s*/.exec(line)?.[0] ?? "").replace(/\t/g, "    ").length

function startsBlock(line: string): boolean {
  return (
    FENCE.test(line) ||
    HEADING.test(line) ||
    RULE.test(line) ||
    QUOTE.test(line) ||
    ITEM.test(line)
  )
}

function blocks(lines: string[], depth: number): MdBlock[] {
  const out: MdBlock[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i] ?? ""
    if (!line.trim()) {
      i++
      continue
    }
    const fence = FENCE.exec(line)
    if (fence) {
      const marker = fence[1] ?? "```"
      const body: string[] = []
      i++
      while (i < lines.length && !(lines[i] ?? "").trim().startsWith(marker))
        body.push(lines[i++] ?? "")
      i++ // closing fence (or EOF)
      out.push({ t: "code", lang: fence[2] ?? "", v: body.join("\n") })
      continue
    }
    const heading = HEADING.exec(line)
    if (heading) {
      out.push({
        t: "h",
        level: (heading[1]?.length ?? 1) as 1,
        c: inlines(heading[2] ?? ""),
      })
      i++
      continue
    }
    if (RULE.test(line)) {
      out.push({ t: "hr" })
      i++
      continue
    }
    if (QUOTE.test(line)) {
      const body: string[] = []
      while (i < lines.length && QUOTE.test(lines[i] ?? ""))
        body.push((lines[i++] ?? "").replace(QUOTE, ""))
      out.push({
        t: "quote",
        c:
          depth < MAX_DEPTH
            ? blocks(body, depth + 1)
            : [{ t: "p", c: text(body.join(" ")) }],
      })
      continue
    }
    const item = ITEM.exec(line)
    if (item) {
      const [block, next] = list(lines, i, depth)
      out.push(block)
      i = next
      continue
    }
    const para: string[] = []
    while (
      i < lines.length &&
      (lines[i] ?? "").trim() &&
      (para.length === 0 || !startsBlock(lines[i] ?? ""))
    ) {
      para.push((lines[i++] ?? "").trim())
    }
    out.push({ t: "p", c: inlines(para.join(" ")) })
  }
  return out
}

function list(
  lines: string[],
  start: number,
  depth: number
): [MdBlock, number] {
  const first = ITEM.exec(lines[start] ?? "")
  const indent = indentOf(lines[start] ?? "")
  const ordered = /\d/.test(first?.[2] ?? "")
  const items: MdBlock[][] = []
  let i = start
  while (i < lines.length) {
    const m = ITEM.exec(lines[i] ?? "")
    if (
      !m ||
      indentOf(lines[i] ?? "") !== indent ||
      /\d/.test(m[2] ?? "") !== ordered
    )
      break
    const body = [m[3] ?? ""]
    i++
    // Continuation: blank lines followed by deeper indentation, or deeper lines.
    while (i < lines.length) {
      const l = lines[i] ?? ""
      if (!l.trim()) {
        const nextLine = lines[i + 1] ?? ""
        if (nextLine.trim() && indentOf(nextLine) > indent) {
          body.push("")
          i++
          continue
        }
        break
      }
      if (indentOf(l) > indent) {
        body.push(l.slice(Math.min(indentOf(l), indent + 2)))
        i++
        continue
      }
      if (!ITEM.test(l) && !startsBlock(l)) {
        body.push(l.trim()) // lazy continuation
        i++
        continue
      }
      break
    }
    items.push(
      depth < MAX_DEPTH
        ? blocks(body, depth + 1)
        : [{ t: "p", c: text(body.join(" ")) }]
    )
  }
  const block: MdBlock = ordered
    ? { t: "ol", start: Number.parseInt(first?.[2] ?? "1", 10) || 1, items }
    : { t: "ul", items }
  return [block, i]
}

const text = (v: string): MdInline[] => (v ? [{ t: "text", v }] : [])

/** Only http(s) and mailto survive; control characters can't smuggle a scheme. */
export function safeHref(raw: string): string | null {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
  const href = raw.trim().replace(/[\u0000-\u001f\u007f\s]/g, "")
  if (
    /^(https?:\/\/|mailto:)/i.test(href) &&
    !/["'<>`]/.test(href) &&
    href.length <= 2048
  )
    return href
  return null
}

const DELIMS = ["**", "__", "~~", "*", "_"] as const
const KIND = {
  "**": "strong",
  __: "strong",
  "~~": "del",
  "*": "em",
  _: "em",
} as const

export function inlines(src: string, depth = 0): MdInline[] {
  const out: MdInline[] = []
  let buf = ""
  const flush = () => {
    if (buf) out.push({ t: "text", v: buf })
    buf = ""
  }
  let i = 0
  while (i < src.length) {
    const ch = src[i] ?? ""
    if (
      ch === "\\" &&
      i + 1 < src.length &&
      /[\\`*_{}[\]()#+\-.!~>|<]/.test(src[i + 1] ?? "")
    ) {
      buf += src[i + 1]
      i += 2
      continue
    }
    if (ch === "`") {
      const run = /^`+/.exec(src.slice(i))?.[0] ?? "`"
      const end = src.indexOf(run, i + run.length)
      if (end !== -1) {
        flush()
        out.push({
          t: "code",
          v:
            src.slice(i + run.length, end).trim() ||
            src.slice(i + run.length, end),
        })
        i = end + run.length
        continue
      }
    }
    if (ch === "<") {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(src.slice(i))
      const href = auto ? safeHref(auto[1] ?? "") : null
      if (auto && href) {
        flush()
        out.push({ t: "link", href, c: [{ t: "text", v: auto[1] ?? "" }] })
        i += auto[0].length
        continue
      }
    }
    if (ch === "[" || (ch === "!" && src[i + 1] === "[")) {
      const at = ch === "!" ? i + 1 : i
      const link = matchLink(src, at)
      if (link) {
        flush()
        const label =
          depth < MAX_DEPTH ? inlines(link.label, depth + 1) : text(link.label)
        const href = safeHref(link.url)
        if (href)
          out.push({ t: "link", href, c: label.length ? label : text(href) })
        else out.push(...label)
        i = link.end
        continue
      }
    }
    const delim = DELIMS.find((d) => src.startsWith(d, i))
    if (delim && depth < MAX_DEPTH) {
      const close = findClose(src, i + delim.length, delim)
      if (close !== -1) {
        flush()
        out.push({
          t: KIND[delim],
          c: inlines(src.slice(i + delim.length, close), depth + 1),
        })
        i = close + delim.length
        continue
      }
    }
    buf += ch
    i++
  }
  flush()
  return out
}

function matchLink(
  src: string,
  at: number
): { label: string; url: string; end: number } | null {
  let depth = 0
  let j = at
  for (; j < src.length; j++) {
    if (src[j] === "\\") {
      j++
      continue
    }
    if (src[j] === "[") depth++
    else if (src[j] === "]" && --depth === 0) break
  }
  if (j >= src.length || src[j + 1] !== "(") return null
  const close = src.indexOf(")", j + 2)
  if (close === -1) return null
  const url = (
    src
      .slice(j + 2, close)
      .trim()
      .split(/\s+/)[0] ?? ""
  ).replace(/^<|>$/g, "")
  return { label: src.slice(at + 1, j), url, end: close + 1 }
}

/** A closing delimiter that isn't right after whitespace and has content before it. */
function findClose(src: string, from: number, delim: string): number {
  if (/\s/.test(src[from] ?? " ")) return -1
  let k = src.indexOf(delim, from + 1)
  while (k !== -1) {
    if (
      !/\s/.test(src[k - 1] ?? " ") &&
      !(delim.length === 1 && src[k + 1] === delim)
    )
      return k
    k = src.indexOf(delim, k + 1)
  }
  return -1
}

/** Plain text of blocks (excerpts, word counts). */
export function plainText(bs: MdBlock[]): string {
  const inl = (xs: MdInline[]): string =>
    xs.map((x) => ("v" in x ? x.v : inl(x.c))).join("")
  return bs
    .map((b) => {
      switch (b.t) {
        case "h":
        case "p":
          return inl(b.c)
        case "code":
          return b.v
        case "quote":
          return plainText(b.c)
        case "ul":
        case "ol":
          return b.items.map(plainText).join(" ")
        default:
          return ""
      }
    })
    .filter(Boolean)
    .join(" ")
}
