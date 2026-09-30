import { useAction, useView } from "@app/bridge"
import type {
  InboxFilter,
  NotificationKindKey,
  NotificationVM,
} from "@app/protocol"
import {
  ArrowSwapIcon,
  Avatar,
  Button,
  CheckCircleIcon,
  ClockIcon,
  cx,
  EditIcon,
  IconButton,
  InboxIcon,
  MentionIcon,
  PersonAddIcon,
  SettingsIcon,
  Spinner,
  Tabs,
} from "@app/ui-kit"
import type { ReactNode } from "react"
import { Link, useNavigate, useSearchParams } from "react-router"
import styles from "./InboxPage.module.css"

const KIND_ICON: Record<NotificationKindKey, ReactNode> = {
  MENTION: <MentionIcon size={16} />,
  ASSIGNED: <PersonAddIcon size={16} />,
  STATUS: <ArrowSwapIcon size={16} />,
  DUE: <ClockIcon size={16} />,
  REQUEST: <EditIcon size={16} />,
  REVIEWED: <CheckCircleIcon size={16} />,
}

/** URL → view params: `?filter=unread&kind=MENTION` (the worker validates). */
export function inboxParams(search: URLSearchParams): {
  filter: InboxFilter
  kind?: string
} {
  const filter: InboxFilter =
    search.get("filter") === "unread" ? "unread" : "all"
  const kind = search.get("kind")
  return kind ? { filter, kind } : { filter }
}

/** `/inbox` (E9-S2): grouped by day, filterable by read state and kind. */
export function InboxPage() {
  const [search, setSearch] = useSearchParams()
  const params = inboxParams(search)
  const inbox = useView("inbox.list", params, { keepPrevious: true })
  const readAll = useAction("notifications.readAll")
  const navigate = useNavigate()
  const vm = inbox.data

  const setParam = (key: "filter" | "kind", value: string) =>
    setSearch((s) => {
      const next = new URLSearchParams(s)
      if (value) next.set(key, value)
      else next.delete(key)
      return next
    })

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Inbox</h1>
          {vm && <p className={styles.muted}>{vm.unreadText}</p>}
        </div>
        <div className={styles.actions}>
          <Button
            icon={<CheckCircleIcon size={16} />}
            disabled={!vm || vm.unreadCount === 0 || readAll.pending}
            onClick={() => readAll.run({}).catch(() => {})}
          >
            Mark all as read
          </Button>
          <IconButton
            appearance="subtle"
            icon={<SettingsIcon />}
            aria-label="Notification settings"
            title="Notification settings"
            onClick={() => navigate("/settings/notifications")}
          />
        </div>
      </header>
      {readAll.error && (
        <p role="alert" className={styles.error}>
          {readAll.error.message}
        </p>
      )}
      <Tabs
        label="Inbox filter"
        value={params.filter}
        onChange={(next) =>
          setParam("filter", next === "unread" ? "unread" : "")
        }
        items={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
      >
        {vm && vm.kindFilters.length > 1 && (
          // A labelled set of toggle buttons.
          // biome-ignore lint/a11y/useSemanticElements: see above
          <div className={styles.chips} role="group" aria-label="Kind">
            {vm.kindFilters.map((f) => (
              <button
                key={f.value || "all"}
                type="button"
                aria-pressed={vm.kind === f.value}
                className={cx(
                  styles.chip,
                  vm.kind === f.value && styles.chipOn
                )}
                onClick={() => setParam("kind", f.value)}
              >
                {f.label}
                <span className={styles.chipCount}>{f.count}</span>
              </button>
            ))}
          </div>
        )}
        {!vm && !inbox.error && <Spinner label="Loading notifications" />}
        {inbox.error && !vm && (
          <p role="alert" className={styles.error}>
            {inbox.error.message}
          </p>
        )}
        {vm?.isEmpty && (
          <div className={styles.empty}>
            <span className={styles.emptyIcon} aria-hidden="true">
              <InboxIcon size={24} />
            </span>
            <p className={styles.emptyText}>{vm.emptyText}</p>
            <Link to="/settings/notifications" className={styles.link}>
              Choose what you're notified about
            </Link>
          </div>
        )}
        {vm && !vm.isEmpty && (
          <div className={styles.sections}>
            {vm.sections.map((section) => (
              <section
                key={section.key}
                aria-labelledby={`inbox-${section.key}`}
              >
                <h2 id={`inbox-${section.key}`} className={styles.day}>
                  {section.label}
                </h2>
                <ul className={styles.list} aria-label={section.label}>
                  {section.items.map((n) => (
                    <NotificationItem key={n.id} n={n} />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </Tabs>
    </div>
  )
}

function NotificationItem({ n }: { n: NotificationVM }) {
  const read = useAction("notifications.read")
  const markRead = () => {
    if (n.unread) void read.run({ id: n.id }).catch(() => {})
  }
  return (
    <li className={cx(styles.item, n.unread && styles.unread)}>
      <span className={styles.who} aria-hidden="true">
        {n.actorName ? (
          <Avatar
            name={n.actorName}
            image={n.actorImage ?? undefined}
            size={32}
          />
        ) : (
          <span className={styles.system}>
            <ClockIcon size={16} />
          </span>
        )}
        <span className={cx(styles.kind, styles[n.tone])}>
          {KIND_ICON[n.kind]}
        </span>
      </span>
      <div className={styles.body}>
        <p className={styles.line}>
          <span className={styles.text}>{n.text}</span>
          <span className={styles.kindLabel}>{n.kindLabel}</span>
        </p>
        {n.taskId ? (
          <Link
            to={{ pathname: "/tasks", search: `?task=${n.taskId}` }}
            className={styles.task}
            onClick={markRead}
          >
            {n.taskTitle}
          </Link>
        ) : (
          <p className={styles.muted}>
            {n.taskTitle} · {n.deletedText}
          </p>
        )}
        {n.quote && <blockquote className={styles.quote}>{n.quote}</blockquote>}
      </div>
      <div className={styles.meta}>
        <span className={styles.time}>{n.timeText}</span>
        {n.unread ? (
          <Button
            size="small"
            appearance="subtle"
            className={styles.markRead}
            aria-label={`Mark as read: ${n.text}`}
            onClick={markRead}
          >
            Mark read
          </Button>
        ) : null}
        <span
          className={styles.dot}
          role="img"
          aria-label={n.unread ? "Unread" : "Read"}
        />
      </div>
    </li>
  )
}
