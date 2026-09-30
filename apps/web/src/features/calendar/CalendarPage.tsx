import { useView } from "@app/bridge"
import { Button, cx, Spinner } from "@app/ui-kit"
import { Link, useSearchParams } from "react-router"
import { TaskRowList } from "../tasks/TaskGroups.tsx"
import styles from "./CalendarPage.module.css"

/** `/calendar?month=YYYY-MM`: tasks by due date (E7-S2). */
export function CalendarPage() {
  const [search, setSearch] = useSearchParams()
  const month = search.get("month") ?? undefined
  const cal = useView("calendar.month", month ? { month } : {}, {
    keepPrevious: true,
  })
  const vm = cal.data
  const go = (m: string) =>
    setSearch((s) => {
      const next = new URLSearchParams(s)
      next.set("month", m)
      return next
    })
  const taskLink = (id: string) => {
    const next = new URLSearchParams(search)
    next.set("task", id)
    return { search: `?${next}` }
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>{vm?.monthLabel ?? "Calendar"}</h1>
        {vm && (
          <nav className={styles.nav} aria-label="Month">
            <Button
              onClick={() => go(vm.prevMonth)}
              aria-label="Previous month"
            >
              ‹
            </Button>
            <Button onClick={() => go(vm.thisMonth)} disabled={vm.isThisMonth}>
              Today
            </Button>
            <Button onClick={() => go(vm.nextMonth)} aria-label="Next month">
              ›
            </Button>
          </nav>
        )}
      </header>

      {!vm && !cal.error && <Spinner label="Loading calendar" />}
      {cal.error && !vm && (
        <p role="alert" className={styles.error}>
          {cal.error.message}
        </p>
      )}

      {vm && (
        <div className={styles.layout}>
          <table className={styles.grid} aria-label={vm.monthLabel}>
            <thead>
              <tr>
                {vm.weekdays.map((d) => (
                  <th key={d.long} scope="col" abbr={d.long}>
                    {d.short}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vm.weeks.map((w) => (
                <tr key={w.key}>
                  {w.days.map((d) => (
                    <td
                      key={d.date}
                      className={cx(
                        styles.day,
                        !d.inMonth && styles.outside,
                        d.isToday && styles.today
                      )}
                      aria-label={d.ariaLabel}
                    >
                      <span className={styles.dayNumber} aria-hidden="true">
                        {d.dayText}
                      </span>
                      {d.tasks.length > 0 && (
                        <ul className={styles.chips}>
                          {d.tasks.map((t) => (
                            <li key={t.id}>
                              <Link
                                to={taskLink(t.id)}
                                aria-label={t.ariaLabel}
                                className={cx(
                                  styles.chip,
                                  styles[t.tone],
                                  t.done && styles.done
                                )}
                              >
                                {t.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      )}
                      {d.moreText && (
                        <span className={styles.more}>{d.moreText}</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>

          <section className={styles.side} aria-labelledby="undated-title">
            <h2 id="undated-title" className={styles.sideTitle}>
              No due date
            </h2>
            <p className={styles.muted}>{vm.undatedText}</p>
            {vm.undated.length > 0 && (
              <TaskRowList
                tasks={vm.undated}
                search={search}
                label="Tasks without a due date"
              />
            )}
          </section>
        </div>
      )}
    </div>
  )
}
