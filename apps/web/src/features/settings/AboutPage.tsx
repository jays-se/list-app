import { ApiStatusCard } from "../system/ApiStatusCard.tsx"
import styles from "./Settings.module.css"

/** App and API version details (moved off the home page). */
export function AboutPage() {
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>About</h1>
        <p className={styles.lead}>Service status and versions.</p>
      </header>
      <ApiStatusCard />
    </div>
  )
}
