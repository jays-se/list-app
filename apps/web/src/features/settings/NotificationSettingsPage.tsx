import { useAction, useView } from "@app/bridge"
import { Spinner, Switch } from "@app/ui-kit"
import styles from "./Settings.module.css"

/** Per-kind in-app notifications (E9-S3), moved here from the inbox. */
export function NotificationSettingsPage() {
  const settings = useView("notifications.settings", {})
  const setEnabled = useAction("notifications.setEnabled")
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>Notifications</h1>
        <p className={styles.lead}>
          Choose what shows up in your inbox. You never get notified about your
          own changes.
        </p>
      </header>
      <section className={styles.card} aria-labelledby="notify-settings">
        <h2 id="notify-settings" className={styles.cardTitle}>
          Notify me about
        </h2>
        {setEnabled.error && (
          <p role="alert" className={styles.error}>
            {setEnabled.error.message}
          </p>
        )}
        {!settings.data && <Spinner label="Loading settings" />}
        <ul className={styles.rows}>
          {settings.data?.items.map((s) => (
            <li key={s.kind} className={styles.row}>
              {/* Uncontrolled + keyed on the worker's value (optimistic toggle). */}
              <Switch
                key={`${s.kind}:${s.enabled}`}
                label={s.label}
                description={s.description}
                defaultChecked={s.enabled}
                onChange={(e) =>
                  setEnabled
                    .run({ kind: s.kind, enabled: e.target.checked })
                    .catch(() => {})
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
