import { useView } from "@app/bridge"
import { Avatar, Badge, Spinner } from "@app/ui-kit"
import { Link, useSearchParams } from "react-router"
import { ApiStatusCard } from "../system/ApiStatusCard.tsx"
import { TaskDrawerHost } from "../tasks/TaskDrawerHost.tsx"
import { TaskRowList } from "../tasks/TaskGroups.tsx"
import styles from "./DashboardPage.module.css"

/** Home: tiles, upcoming, review queue, status and workload (E7-S1). */
export function DashboardPage() {
  const session = useView("session.current", {})
  const dash = useView("dashboard.summary", {})
  const [search] = useSearchParams()
  const vm = dash.data
  const firstName = session.data?.user?.firstName
  const workspace = session.data?.activeWorkspace
  const taskLink = (id: string) => {
    const next = new URLSearchParams(search)
    next.set("task", id)
    return { search: `?${next}` }
  }

  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>
          {firstName ? `Hi, ${firstName}` : "Welcome"}
        </h1>
        {workspace && (
          <p className={styles.lead}>
            You're in <strong>{workspace.name}</strong>. Here's what's
            happening.
          </p>
        )}
      </header>

      {!vm && !dash.error && <Spinner label="Loading dashboard" />}
      {dash.error && !vm && (
        <p role="alert" className={styles.error}>
          {dash.error.message}
        </p>
      )}

      {vm && (
        <>
          <ul className={styles.tiles} aria-label="Summary">
            {vm.tiles.map((t) => {
              const body = (
                <>
                  <span className={styles.tileLabel}>{t.label}</span>
                  <span className={styles.tileValue}>
                    <Badge color={t.tone} size="large">
                      {t.value}
                    </Badge>
                  </span>
                  <span className={styles.tileHint}>{t.hint}</span>
                </>
              )
              return (
                <li key={t.key} className={styles.tile}>
                  {t.tasksSearch ? (
                    <Link
                      to={{ pathname: "/tasks", search: t.tasksSearch }}
                      className={styles.tileLink}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={styles.tileLink}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className={styles.columns}>
            <section className={styles.card} aria-labelledby="upcoming-title">
              <h2 id="upcoming-title" className={styles.cardTitle}>
                Upcoming
              </h2>
              {vm.upcoming.length ? (
                <TaskRowList
                  tasks={vm.upcoming}
                  search={search}
                  label="Upcoming tasks"
                />
              ) : (
                <p className={styles.muted}>{vm.upcomingEmptyText}</p>
              )}
            </section>

            <section className={styles.card} aria-labelledby="review-title">
              <h2 id="review-title" className={styles.cardTitle}>
                Awaiting your review
              </h2>
              {vm.reviewQueue.length ? (
                <ul className={styles.list}>
                  {vm.reviewQueue.map((r) => (
                    <li key={r.id} className={styles.reviewRow}>
                      <Link to={taskLink(r.id)} className={styles.link}>
                        {r.title}
                      </Link>
                      <Badge color="informative">{r.pendingText}</Badge>
                      {r.dueText && (
                        <span className={styles.muted}>{r.dueText}</span>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.muted}>{vm.reviewEmptyText}</p>
              )}
            </section>

            <section className={styles.card} aria-labelledby="status-title">
              <h2 id="status-title" className={styles.cardTitle}>
                By status <span className={styles.count}>{vm.totalText}</span>
              </h2>
              <ul className={styles.bars}>
                {vm.statusCounts.map((s) => (
                  <li key={s.status} className={styles.bar}>
                    <span className={styles.barLabel}>{s.label}</span>
                    <span className={styles.track} aria-hidden="true">
                      <span
                        className={styles.fill}
                        style={{ width: `${s.percent}%` }}
                      />
                    </span>
                    <span className={styles.barValue}>{s.count}</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className={styles.card} aria-labelledby="workload-title">
              <h2 id="workload-title" className={styles.cardTitle}>
                Workload
              </h2>
              <ul className={styles.bars}>
                {vm.workload.map((w) => (
                  <li key={w.id} className={styles.bar}>
                    <span className={styles.barLabel}>
                      <Avatar
                        name={w.name}
                        image={w.image ?? undefined}
                        size={20}
                      />
                      {w.name}
                    </span>
                    <span className={styles.track} aria-hidden="true">
                      <span
                        className={styles.fill}
                        style={{ width: `${w.percent}%` }}
                      />
                    </span>
                    <span className={styles.barValue}>{w.text}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}

      <ApiStatusCard />
      <TaskDrawerHost />
    </div>
  )
}
