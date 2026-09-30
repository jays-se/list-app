import { useAction, useView } from "@app/bridge"
import type { InboxFilter, NotificationVM } from "@app/protocol"
import { Badge, Button, Checkbox, Spinner, Tabs } from "@app/ui-kit"
import { Link, useSearchParams } from "react-router"
import styles from "./InboxPage.module.css"

/** `/inbox?filter=unread` (E9-S2) with per-kind settings (E9-S3). */
export function InboxPage() {
  const [search, setSearch] = useSearchParams()
  const filter: InboxFilter =
    search.get("filter") === "unread" ? "unread" : "all"
  const inbox = useView("inbox.list", { filter }, { keepPrevious: true })
  const readAll = useAction("notifications.readAll")
  const vm = inbox.data

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Inbox</h1>
          {vm && <p className={styles.muted}>{vm.unreadText}</p>}
        </div>
        <Button
          disabled={!vm || vm.unreadCount === 0 || readAll.pending}
          onClick={() => readAll.run({}).catch(() => {})}
        >
          Mark all as read
        </Button>
      </header>
      {readAll.error && (
        <p role="alert" className={styles.error}>
          {readAll.error.message}
        </p>
      )}
      <Tabs
        label="Inbox filter"
        value={filter}
        onChange={(next) =>
          setSearch(next === "unread" ? { filter: "unread" } : {})
        }
        items={[
          { value: "all", label: "All" },
          { value: "unread", label: "Unread" },
        ]}
      >
        {!vm && !inbox.error && <Spinner label="Loading notifications" />}
        {inbox.error && !vm && (
          <p role="alert" className={styles.error}>
            {inbox.error.message}
          </p>
        )}
        {vm?.isEmpty && <p className={styles.empty}>{vm.emptyText}</p>}
        {vm && !vm.isEmpty && (
          <ul className={styles.list} aria-label="Notifications">
            {vm.items.map((n) => (
              <NotificationItem key={n.id} n={n} />
            ))}
          </ul>
        )}
      </Tabs>
      <NotificationSettings />
    </div>
  )
}

function NotificationItem({ n }: { n: NotificationVM }) {
  const read = useAction("notifications.read")
  const markRead = () => {
    if (n.unread) void read.run({ id: n.id }).catch(() => {})
  }
  return (
    <li className={n.unread ? `${styles.item} ${styles.unread}` : styles.item}>
      <span
        className={styles.dot}
        role="img"
        aria-label={n.unread ? "Unread" : "Read"}
      />
      <div className={styles.body}>
        <div className={styles.line}>
          <Badge color={n.unread ? "brand" : "subtle"}>{n.kindLabel}</Badge>
          <span>{n.text}</span>
          <span className={styles.muted}>{n.timeText}</span>
        </div>
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
      {n.unread && (
        <Button
          size="small"
          appearance="subtle"
          aria-label={`Mark as read: ${n.text}`}
          onClick={markRead}
        >
          Mark read
        </Button>
      )}
    </li>
  )
}

function NotificationSettings() {
  const settings = useView("notifications.settings", {})
  const setEnabled = useAction("notifications.setEnabled")
  return (
    <section className={styles.settings} aria-labelledby="notify-settings">
      <h2 id="notify-settings" className={styles.subtitle}>
        Notify me about
      </h2>
      {setEnabled.error && (
        <p role="alert" className={styles.error}>
          {setEnabled.error.message}
        </p>
      )}
      {settings.data?.items.map((s) => (
        // Uncontrolled + keyed on the worker's value (optimistic toggle).
        <Checkbox
          key={`${s.kind}:${s.enabled}`}
          defaultChecked={s.enabled}
          label={
            <span className={styles.setting}>
              <span>{s.label}</span>
              <span className={styles.muted}>{s.description}</span>
            </span>
          }
          onChange={(e) =>
            setEnabled
              .run({ kind: s.kind, enabled: e.target.checked })
              .catch(() => {})
          }
        />
      ))}
    </section>
  )
}
