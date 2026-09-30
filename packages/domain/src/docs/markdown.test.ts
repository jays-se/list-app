import type { MdBlock, MdInline } from "@app/protocol"
import { describe, expect, it } from "vitest"
import { inlines, parseMarkdown, plainText, safeHref } from "./markdown.ts"

const t = (v: string): MdInline => ({ t: "text", v })

describe("markdown blocks", () => {
  it("parses headings, paragraphs, rules, quotes and fences", () => {
    const md = [
      "# Title",
      "Some *text*",
      "that wraps.",
      "",
      "---",
      "> quoted **bold**",
      "> more",
      "",
      "```ts",
      "const x = <b>1</b>",
      "```",
      "###### Six ###",
    ].join("\n")
    expect(parseMarkdown(md)).toEqual<MdBlock[]>([
      { t: "h", level: 1, c: [t("Title")] },
      {
        t: "p",
        c: [t("Some "), { t: "em", c: [t("text")] }, t(" that wraps.")],
      },
      { t: "hr" },
      {
        t: "quote",
        c: [
          {
            t: "p",
            c: [t("quoted "), { t: "strong", c: [t("bold")] }, t(" more")],
          },
        ],
      },
      { t: "code", lang: "ts", v: "const x = <b>1</b>" },
      { t: "h", level: 6, c: [t("Six")] },
    ])
  })

  it("parses bullet, numbered and nested lists", () => {
    const md = "- one\n- two\n  - nested\n\n  continued\n- three\n\n3. c\n4. d"
    expect(parseMarkdown(md)).toEqual<MdBlock[]>([
      {
        t: "ul",
        items: [
          [{ t: "p", c: [t("one")] }],
          [
            { t: "p", c: [t("two")] },
            { t: "ul", items: [[{ t: "p", c: [t("nested")] }]] },
            { t: "p", c: [t("continued")] },
          ],
          [{ t: "p", c: [t("three")] }],
        ],
      },
      {
        t: "ol",
        start: 3,
        items: [[{ t: "p", c: [t("c")] }], [{ t: "p", c: [t("d")] }]],
      },
    ])
  })

  it("handles an unclosed fence, empty headings and CRLF", () => {
    expect(parseMarkdown("```\ncode\r\nmore")).toEqual([
      { t: "code", lang: "", v: "code\nmore" },
    ])
    expect(parseMarkdown("#")).toEqual([{ t: "h", level: 1, c: [] }])
    expect(parseMarkdown("")).toEqual([])
  })

  it("survives pathological nesting", () => {
    const deep = `${"> ".repeat(50)}deep`
    expect(() => parseMarkdown(deep)).not.toThrow()
    const stars = `${"*".repeat(5000)}x`
    expect(plainText(parseMarkdown(stars))).toContain("x")
  })
})

describe("markdown inlines", () => {
  it("parses emphasis, strike, code, escapes and links", () => {
    expect(
      inlines("**b** _i_ ~~s~~ `a*b` \\*lit\\* [site](https://x.io)")
    ).toEqual<MdInline[]>([
      { t: "strong", c: [t("b")] },
      t(" "),
      { t: "em", c: [t("i")] },
      t(" "),
      { t: "del", c: [t("s")] },
      t(" "),
      { t: "code", v: "a*b" },
      t(" *lit* "),
      { t: "link", href: "https://x.io", c: [t("site")] },
    ])
  })

  it("keeps unmatched delimiters and spaced stars as text", () => {
    expect(inlines("2 * 3 * 4")).toEqual([t("2 * 3 * 4")])
    expect(inlines("**open")).toEqual([t("**open")])
    expect(inlines("`open")).toEqual([t("`open")])
    expect(inlines("[no url]")).toEqual([t("[no url]")])
  })

  it("turns images and autolinks into links", () => {
    expect(inlines("![logo](https://x.io/a.png) <https://x.io>")).toEqual([
      { t: "link", href: "https://x.io/a.png", c: [t("logo")] },
      t(" "),
      { t: "link", href: "https://x.io", c: [t("https://x.io")] },
    ])
    expect(inlines("[mail](mailto:a@x.io)")).toEqual([
      { t: "link", href: "mailto:a@x.io", c: [t("mail")] },
    ])
    expect(inlines("[](https://x.io)")).toEqual([
      { t: "link", href: "https://x.io", c: [t("https://x.io")] },
    ])
  })
})

/** Anything a hostile doc could contain must stay inert (E11-S2 AC). */
describe("XSS corpus", () => {
  const corpus = [
    "<script>alert(1)</script>",
    "<img src=x onerror=alert(1)>",
    "[x](javascript:alert(1))",
    "[x](JaVaScRiPt:alert(1))",
    "[x](java\tscript:alert(1))",
    "[x](  javascript:alert(1))",
    "[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)",
    "[x](vbscript:msgbox(1))",
    "[x](//evil.example)",
    "[x](/relative)",
    "![x](javascript:alert(1))",
    "<javascript:alert(1)>",
    '<a href="javascript:alert(1)">x</a>',
    "<svg onload=alert(1)>",
    "<iframe src=//evil></iframe>",
    '[x](https://ok.example" onmouseover="alert(1))',
    "&lt;script&gt;",
  ]

  const walk = (bs: MdBlock[]): MdInline[] =>
    bs.flatMap((b) => {
      if (b.t === "h" || b.t === "p") return b.c.flatMap(flat)
      if (b.t === "quote") return walk(b.c)
      if (b.t === "ul" || b.t === "ol") return b.items.flatMap(walk)
      return []
    })
  const flat = (n: MdInline): MdInline[] =>
    "c" in n ? [n, ...n.c.flatMap(flat)] : [n]

  it.each(corpus)("%s stays inert", (src) => {
    const nodes = walk(parseMarkdown(src))
    for (const n of nodes) {
      if (n.t === "link") {
        expect(n.href).toMatch(/^(https?:\/\/|mailto:)/i)
        expect(n.href).not.toMatch(/["'<>\s]/)
      }
    }
    // HTML never becomes structure: it is text, character for character.
    if (src.startsWith("<") && !/^<(https?:|mailto:)/i.test(src)) {
      expect(plainText(parseMarkdown(src))).toBe(src)
    }
  })

  it("vets hrefs", () => {
    expect(safeHref(" https://a.io ")).toBe("https://a.io")
    expect(safeHref("HTTP://A.IO")).toBe("HTTP://A.IO")
    expect(safeHref("java\nscript:x")).toBeNull()
    expect(safeHref(`https://${"a".repeat(3000)}`)).toBeNull()
  })
})
