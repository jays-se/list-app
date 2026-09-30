import { useBridgeStatus } from "@app/bridge"
import { cx } from "@app/ui-kit"
import { NavLink, Outlet } from "react-router"
import styles from "./AppShell.module.css"
import { ThemeSwitcher } from "./ThemeSwitcher.tsx"

export function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={cx(styles.brand)}>
          List
        </NavLink>
        <nav aria-label="Primary" className={styles.nav}>
          <NavLink to="/" end className={navClass}>
            Home
          </NavLink>
          {import.meta.env.DEV && (
            <NavLink to="/_design" className={navClass}>
              Design system
            </NavLink>
          )}
        </nav>
        <ThemeSwitcher />
      </header>
      <WorkerStatusBanner />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  )
}

function navClass({ isActive }: { isActive: boolean }) {
  return cx(styles.navLink, isActive && styles.active)
}

function WorkerStatusBanner() {
  const status = useBridgeStatus()
  if (status !== "fatal" && status !== "restarting") return null
  return (
    <div role="status" className={styles.banner}>
      {status === "restarting"
        ? "Reconnecting to the data worker…"
        : "The data worker stopped. Reload the page to continue."}
    </div>
  )
}
