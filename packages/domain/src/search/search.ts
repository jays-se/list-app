import type { ClientList, DocSummary, TaskSummary } from "@app/api-client"
import type { SearchGroupVM, SearchResultVM, SearchVM } from "@app/protocol"
import { docsListQuery } from "../docs/docs.ts"
import { defineView } from "../runtime.ts"
import { todayISO } from "../shared/dates.ts"
import { STATUS_COLOR, STATUS_LABEL } from "../tasks/tasks.labels.ts"
import {
  clientsQuery,
  normalizeFilter,
  taskListQuery,
} from "../tasks/tasks.queries.ts"
import { dueOf } from "../tasks/tasks.vm.ts"

/** Places and commands you can jump to by name (like a command palette). */
const PAGES: { title: string; to: string; keywords: string }[] = [
  { title: "Home", to: "/", keywords: "dashboard overview" },
  { title: "Tasks", to: "/tasks", keywords: "list todo" },
  { title: "My tasks", to: "/tasks?mine=true", keywords: "assigned me mine" },
  { title: "Create task", to: "?create=1", keywords: "new add" },
  { title: "Calendar", to: "/calendar", keywords: "month due dates" },
  { title: "Quick capture", to: "/capture", keywords: "paste bulk notes" },
  { title: "Docs", to: "/docs", keywords: "documents markdown notes" },
  { title: "Clients", to: "/clients", keywords: "customers" },
  { title: "Inbox", to: "/inbox", keywords: "notifications mentions" },
  {
    title: "Workspace settings",
    to: "/settings/workspace",
    keywords: "invite members labels",
  },
  {
    title: "Notification settings",
    to: "/settings/notifications",
    keywords: "notify email alerts",
  },
]

const LIMITS = { pages: 4, tasks: 6, docs: 4, clients: 4 } as const

const words = (q: string) => q.toLowerCase().split(/\s+/).filter(Boolean)

/**
 * Lower is better: 0 exact, 1 prefix, 2 a word starts with it, 3 anywhere,
 * 4 only in `extra`; null when some query word is missing entirely.
 */
export function score(title: string, query: string, extra = ""): number | null {
  const qs = words(query)
  if (qs.length === 0) return null
  const t = title.toLowerCase()
  const hay = `${t} ${extra.toLowerCase()}`
  if (!qs.every((w) => hay.includes(w))) return null
  const q = qs.join(" ")
  if (t === q) return 0
  if (t.startsWith(q)) return 1
  if (t.split(/[\s\-_/.,:]+/).some((w) => w.startsWith(qs[0] ?? ""))) return 2
  return qs.every((w) => t.includes(w)) ? 3 : 4
}

function rank<T>(
  items: T[],
  query: string,
  text: (item: T) => [title: string, extra?: string]
): T[] {
  return items
    .map((item) => {
      const [title, extra] = text(item)
      return { item, title, s: score(title, query, extra) }
    })
    .filter((x): x is { item: T; title: string; s: number } => x.s !== null)
    .sort((a, b) => a.s - b.s || a.title.localeCompare(b.title))
    .map((x) => x.item)
}

function group(
  key: SearchGroupVM["key"],
  label: string,
  all: SearchResultVM[],
  limit: number
): SearchGroupVM | null {
  if (all.length === 0) return null
  return {
    key,
    label,
    countText: all.length > limit ? `${limit} of ${all.length}` : null,
    items: all.slice(0, limit),
  }
}

export function toSearchVM(
  rawQuery: string,
  tasks: TaskSummary[],
  docs: DocSummary[],
  clients: ClientList,
  today: string,
  locale: string
): SearchVM {
  const query = rawQuery.trim().slice(0, 100)
  if (!query) {
    const items = PAGES.slice(0, 6).map(
      (p): SearchResultVM => ({
        key: `page:${p.to}`,
        kind: "page",
        title: p.title,
        subtitle: null,
        taskId: null,
        to: p.to,
        color: null,
        tone: null,
      })
    )
    return {
      query,
      groups: [{ key: "pages", label: "Jump to", countText: null, items }],
      total: items.length,
      isEmpty: false,
      emptyText: "",
    }
  }

  const pages = rank(PAGES, query, (p) => [p.title, p.keywords]).map(
    (p): SearchResultVM => ({
      key: `page:${p.to}`,
      kind: "page",
      title: p.title,
      subtitle: null,
      taskId: null,
      to: p.to,
      color: null,
      tone: null,
    })
  )
  const taskHits = rank(tasks, query, (t) => [
    t.title,
    [t.client?.name, ...t.labels.map((l) => l.name)].join(" "),
  ]).map((t): SearchResultVM => {
    const due = dueOf(t.dueDate, t.status, today, locale)
    return {
      key: `task:${t.id}`,
      kind: "task",
      title: t.title,
      subtitle: [STATUS_LABEL[t.status], t.client?.name, due.dueText]
        .filter(Boolean)
        .join(" · "),
      taskId: t.id,
      to: null,
      color: STATUS_COLOR[t.status],
      tone: due.dueTone,
    }
  })
  const docHits = rank(docs, query, (d) => [d.title, d.excerpt]).map(
    (d): SearchResultVM => ({
      key: `doc:${d.id}`,
      kind: "doc",
      title: d.title || "Untitled doc",
      subtitle: d.client?.name ?? "Doc",
      taskId: null,
      to: `/docs/${d.id}`,
      color: d.client?.color ?? null,
      tone: null,
    })
  )
  const clientHits = rank(clients.clients, query, (c) => [
    c.name,
    c.email ?? "",
  ]).map(
    (c): SearchResultVM => ({
      key: `client:${c.id}`,
      kind: "client",
      title: c.name,
      subtitle: c.email ?? `${c.taskCount} tasks · ${c.docCount} docs`,
      taskId: null,
      to: `/clients/${c.id}`,
      color: c.color,
      tone: null,
    })
  )

  const groups = [
    group("tasks", "Tasks", taskHits, LIMITS.tasks),
    group("docs", "Docs", docHits, LIMITS.docs),
    group("clients", "Clients", clientHits, LIMITS.clients),
    group("pages", "Go to", pages, LIMITS.pages),
  ].filter((g): g is SearchGroupVM => g !== null)
  const total = groups.reduce((n, g) => n + g.items.length, 0)
  return {
    query,
    groups,
    total,
    isEmpty: total === 0,
    emptyText: `Nothing matches “${query}”.`,
  }
}

export const searchViews = {
  "search.global": defineView({
    queries: (_p: { q: string }, ctx) => ({
      tasks: taskListQuery(ctx.api, normalizeFilter({})),
      docs: docsListQuery(ctx.api, ""),
      clients: clientsQuery(ctx.api),
    }),
    compute: ({ tasks, docs, clients }, params, ctx) =>
      toSearchVM(
        typeof params.q === "string" ? params.q : "",
        tasks,
        docs,
        clients,
        todayISO(ctx.now()),
        ctx.locale
      ),
  }),
}
