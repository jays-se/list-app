import { useView } from "@app/bridge"
import type { DashboardTileKey, MyWorkTabKey } from "@app/protocol"
import {
  AddIcon,
  Avatar,
  Badge,
  CalendarIcon,
  ChevronRightIcon,
  ClockIcon,
  cx,
  DocumentIcon,
  EditIcon,
  FlashIcon,
  PersonIcon,
  Spinner,
  Swatch,
  Tabs,
  TaskListIcon,
} from "@app/ui-kit"
import { type ReactNode, useState } from "react"
import { Link, useSearchParams } from "react-router"
import { TaskRowList } from "../tasks/TaskGroups.tsx"
import styles from "./DashboardPage.module.css"

const TILE_ICON: Record<DashboardTileKey, ReactNode> = {
  mine: <TaskListIcon />,
  overdue: <ClockIcon />,
  week: <CalendarIcon />,
  review: <EditIcon />,
  unassigned: <PersonIcon />,
}

/** Home: greeting, summary, my work, review queue, progress and workload. */
export function DashboardPage() {
  const session = useView("session.current", {})
  const dash = useView("dashboard.summary", {})
  const [search] = useSearchParams()
  const [tab, setTab] = useState<MyWorkTabKey | null>(null) // UI state
  const vm = dash.data
  const workspace = session.data?.activeWorkspace
  const firstName = session.data?.user?.firstName
  const withSearch = (key: string, value: string) => {
    const next = new URLSearchParams(search)
    next.set(key, value)
    return { search: `?${next}` }
  }
  const current = tab ?? vm?.myWorkDefault ?? "today"
  const work = vm?.myWork.find((t) => t.key === current)

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          {vm && <p className={styles.date}>{vm.dateText}</p>}
          <h1 className={styles.title}>
            {vm?.greetingText ??
              (firstName ? `Welcome, ${firstName}` : "Welcome")}
          </h1>
          {workspace && (
            <p className={styles.lead}>
              You're in <strong>{workspace.name}</strong>. Here's what's
              happening.
            </p>
          )}
        </div>
        <nav aria-label="Quick actions" className={styles.quick}>
          <Link to={withSearch("create", "1")} className={styles.action}>
            <span className={cx(styles.actionIcon, styles.brandIcon)}>
              <AddIcon />
            </span>
            New task
          </Link>
          <Link to="/capture" className={styles.action}>
            <span className={styles.actionIcon}>
              <FlashIcon />
            </span>
            Quick capture
          </Link>
          <Link to="/docs" className={styles.action}>
            <span className={styles.actionIcon}>
              <DocumentIcon />
            </span>
            Docs
          </Link>
          <Link to="/calendar" className={styles.action}>
            <span className={styles.actionIcon}>
              <CalendarIcon />
            </span>
            Calendar
          </Link>
        </nav>
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
                  <span
                    className={cx(styles.tileIcon, styles[t.tone])}
                    aria-hidden="true"
                  >
                    {TILE_ICON[t.key]}
                  </span>
                  <span className={styles.tileText}>
                    <span className={styles.tileValue}>{t.value}</span>
                    <span className={styles.tileLabel}>{t.label}</span>
                    <span className={styles.tileHint}>{t.hint}</span>
                  </span>
                </>
              )
              return (
                <li key={t.key}>
                  {t.tasksSearch ? (
                    <Link
                      to={{ pathname: "/tasks", search: t.tasksSearch }}
                      className={cx(styles.tile, styles.tileLink)}
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className={styles.tile}>{body}</div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className={styles.grid}>
            <section
              className={cx(styles.card, styles.work)}
              aria-labelledby="work-title"
            >
              <div className={styles.cardHead}>
                <h2 id="work-title" className={styles.cardTitle}>
                  My work
                </h2>
                <Link
                  to={{ pathname: "/tasks", search: "?mine=true" }}
                  className={styles.more}
                >
                  All my tasks <ChevronRightIcon size={16} />
                </Link>
              </div>
              <Tabs
                label="My work"
                value={current}
                onChange={setTab}
                items={vm.myWork.map((t) => ({
                  value: t.key,
                  label: (
                    <span className={styles.tabLabel}>
                      {t.label}
                      <span
                        className={cx(
                          styles.tabCount,
                          t.key === "overdue" && t.count > 0 && styles.late
                        )}
                      >
                        {t.count}
                      </span>
                    </span>
                  ),
                }))}
              >
                {work && work.tasks.length > 0 ? (
                  <TaskRowList
                    tasks={work.tasks}
                    search={search}
                    label={work.label}
                  />
                ) : (
                  <div className={styles.emptyWork}>
                    <p className={styles.muted}>{work?.emptyText}</p>
                    <Link
                      to={withSearch("create", "1")}
                      className={styles.more}
                    >
                      Create a task
                    </Link>
                  </div>
                )}
              </Tabs>
            </section>

            <div className={styles.side}>
              <section className={styles.card} aria-labelledby="review-title">
                <h2 id="review-title" className={styles.cardTitle}>
                  Awaiting your review
                </h2>
                {vm.reviewQueue.length ? (
                  <ul className={styles.list}>
                    {vm.reviewQueue.map((r) => (
                      <li key={r.id}>
                        <Link
                          to={withSearch("task", r.id)}
                          className={styles.reviewRow}
                        >
                          <span className={styles.reviewTitle}>{r.title}</span>
                          <Badge color="informative">{r.pendingText}</Badge>
                          {r.dueText && (
                            <span className={styles.muted}>{r.dueText}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.muted}>{vm.reviewEmptyText}</p>
                )}
              </section>

              <section className={styles.card} aria-labelledby="status-title">
                <h2 id="status-title" className={styles.cardTitle}>
                  By status
                </h2>
                <div className={styles.progress}>
                  <span className={styles.percent}>{vm.donePercent}%</span>
                  <span className={styles.muted}>{vm.doneText}</span>
                </div>
                <div className={styles.stack} aria-hidden="true">
                  {vm.statusCounts.map((s) => (
                    <span
                      key={s.status}
                      className={cx(styles.segment, styles[`seg_${s.color}`])}
                      style={{ width: `${s.percent}%` }}
                    />
                  ))}
                </div>
                <ul className={styles.legend}>
                  {vm.statusCounts.map((s) => (
                    <li key={s.status} className={styles.legendRow}>
                      <Swatch color={s.color} />
                      <span className={styles.legendLabel}>{s.label}</span>
                      <span className={styles.legendValue}>{s.count}</span>
                    </li>
                  ))}
                </ul>
                <p className={styles.muted}>{vm.totalText} in total</p>
              </section>
            </div>
          </div>

          <section className={styles.card} aria-labelledby="workload-title">
            <h2 id="workload-title" className={styles.cardTitle}>
              Workload
            </h2>
            <ul className={styles.workload}>
              {vm.workload.map((w) => (
                <li key={w.id} className={styles.bar}>
                  <span className={styles.barLabel}>
                    <Avatar
                      name={w.name}
                      image={w.image ?? undefined}
                      size={24}
                    />
                    <span className={styles.barName}>{w.name}</span>
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
        </>
      )}
    </div>
  )
}
