import { useAction, useBridgeStatus, useView } from "@app/bridge"
import { Avatar, Button, cx } from "@app/ui-kit"
import { NavLink, Outlet } from "react-router"
import { WorkspaceSwitcher } from "../features/workspace/WorkspaceSwitcher.tsx"
import styles from "./AppShell.module.css"
import { ThemeSwitcher } from "./ThemeSwitcher.tsx"

export function AppShell() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <NavLink to="/" className={cx(styles.brand)}>
          List
        </NavLink>
        <WorkspaceSwitcher />
        <nav aria-label="Primary" className={styles.nav}>
          <NavLink to="/" end className={navClass}>
            Dashboard
          </NavLink>
          <NavLink to="/tasks" className={navClass}>
            Tasks
          </NavLink>
          <NavLink to="/calendar" className={navClass}>
            Calendar
          </NavLink>
          <NavLink to="/capture" className={navClass}>
            Capture
          </NavLink>
          <NavLink to="/clients" className={navClass}>
            Clients
          </NavLink>
          <InboxLink />
          <NavLink to="/settings/workspace" className={navClass}>
            Settings
          </NavLink>
          {import.meta.env.DEV && (
            <NavLink to="/_design" className={navClass}>
              Design system
            </NavLink>
          )}
        </nav>
        <ThemeSwitcher />
        <UserMenu />
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

/** Polls with the inbox (20 s); the count comes from the worker. */
function InboxLink() {
  const badge = useView("inbox.badge", {}).data
  return (
    <NavLink
      to="/inbox"
      className={navClass}
      aria-label={badge?.label ?? "Inbox"}
    >
      Inbox
      {badge?.badgeText && (
        <span className={styles.badge} aria-hidden="true">
          {badge.badgeText}
        </span>
      )}
    </NavLink>
  )
}

function UserMenu() {
  const session = useView("session.current", {})
  const logout = useAction("auth.logout")
  const user = session.data?.user
  if (!user) return null
  return (
    <div className={styles.user}>
      <Avatar name={user.name} image={user.image ?? undefined} size={24} />
      <span className={styles.userName}>{user.name}</span>
      <Button
        appearance="subtle"
        size="small"
        disabled={logout.pending}
        // The session guard redirects to /login once the worker reports "anonymous".
        onClick={() => logout.run({}).catch(() => {})}
      >
        Sign out
      </Button>
    </div>
  )
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
