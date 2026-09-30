import { useView } from "@app/bridge"
import { Badge, Spinner } from "@app/ui-kit"
import styles from "./HomePage.module.css"

/**
 * Sprint 0 probe: API → worker (fetch, cache, poll, view model) → bridge →
 * React. This component only renders what the worker computed.
 */
export function HomePage() {
  const info = useView("system.info", {})

  return (
    <section className={styles.page} aria-labelledby="home-title">
      <h1 id="home-title" className={styles.title}>
        Welcome
      </h1>
      <p className={styles.lead}>
        Tasks, approvals, docs and quick capture arrive in the next sprints.
        Below is a live check of the data plane.
      </p>

      <article className={styles.card} aria-labelledby="system-title">
        <header className={styles.cardHeader}>
          <h2 id="system-title" className={styles.cardTitle}>
            API status
          </h2>
          {info.status === "success" && !info.error && (
            <Badge color="success">Connected</Badge>
          )}
          {info.error && <Badge color="danger">Unavailable</Badge>}
          {info.isFetching && info.status === "success" && (
            <Spinner size="tiny" label="Refreshing" />
          )}
        </header>

        {info.status === "loading" && <Spinner label="Contacting the API" />}

        {info.error && (
          <p role="alert" className={styles.error}>
            {info.error.message}
          </p>
        )}

        {info.data && (
          <dl className={styles.facts}>
            <dt>Service</dt>
            <dd data-testid="service">{info.data.service}</dd>
            <dt>Version</dt>
            <dd>{info.data.version}</dd>
            <dt>Uptime</dt>
            <dd>{info.data.uptimeText}</dd>
            <dt>Started</dt>
            <dd>{info.data.startedAtText}</dd>
          </dl>
        )}
      </article>
    </section>
  )
}
