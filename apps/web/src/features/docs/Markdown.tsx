import type { MdBlock, MdInline } from "@app/protocol"
import type { ReactNode } from "react"
import styles from "./Markdown.module.css"

/**
 * Renders the worker's safe markdown AST (ADR-0025). Only React elements
 * and text nodes: no HTML strings, and hrefs were vetted in the worker.
 */
export function Markdown({ blocks }: { blocks: MdBlock[] }) {
  return <div className={styles.md}>{blocks.map(block)}</div>
}

function block(b: MdBlock, i: number): ReactNode {
  switch (b.t) {
    case "h": {
      const H = `h${Math.min(6, b.level + 1)}` as "h2" // the page title is the h1
      return <H key={i}>{b.c.map(inline)}</H>
    }
    case "p":
      return <p key={i}>{b.c.map(inline)}</p>
    case "ul":
      return (
        <ul key={i}>
          {b.items.map((item, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static render of a parsed document
            <li key={j}>{item.map(block)}</li>
          ))}
        </ul>
      )
    case "ol":
      return (
        <ol key={i} start={b.start}>
          {b.items.map((item, j) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static render of a parsed document
            <li key={j}>{item.map(block)}</li>
          ))}
        </ol>
      )
    case "quote":
      return <blockquote key={i}>{b.c.map(block)}</blockquote>
    case "code":
      return (
        <pre key={i}>
          <code data-lang={b.lang || undefined}>{b.v}</code>
        </pre>
      )
    case "hr":
      return <hr key={i} />
  }
}

function inline(n: MdInline, i: number): ReactNode {
  switch (n.t) {
    case "text":
      return n.v
    case "code":
      return <code key={i}>{n.v}</code>
    case "strong":
      return <strong key={i}>{n.c.map(inline)}</strong>
    case "em":
      return <em key={i}>{n.c.map(inline)}</em>
    case "del":
      return <del key={i}>{n.c.map(inline)}</del>
    case "link":
      return (
        <a
          key={i}
          href={n.href}
          target="_blank"
          rel="noopener noreferrer nofollow"
        >
          {n.c.map(inline)}
        </a>
      )
  }
}
