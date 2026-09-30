import { Button, Spinner } from "@app/ui-kit"
import styles from "./FullPageStatus.module.css"

export function FullPageSpinner({ label }: { label: string }) {
  return (
    <div className={styles.center}>
      <Spinner size="large" label={label} />
    </div>
  )
}

export function FullPageError({ message }: { message?: string | undefined }) {
  return (
    <div className={styles.center} role="alert">
      <p className={styles.title}>We couldn't load your session.</p>
      <p className={styles.text}>
        {message ?? "Check your connection and try again."}
      </p>
      <Button appearance="primary" onClick={() => window.location.reload()}>
        Try again
      </Button>
    </div>
  )
}
