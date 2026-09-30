import { useView } from "@app/bridge"
import { Badge, Spinner } from "@app/ui-kit"
import styles from "./ApiStatusCard.module.css"

/**
 * Live check of the data plane (API → worker → bridge → React), shown at
 * the bottom of the dashboard. It only renders what the worker computed.
 */
export function ApiStatusCard() {
  const info = useView("system.info", {})
  return (
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
  )
}
