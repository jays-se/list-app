import { useBridgeStatus } from "@app/bridge"
import { AddIcon, Button, cx, IconButton, NavigationIcon } from "@app/ui-kit"
import { useEffect, useState } from "react"
import { NavLink, Outlet, useLocation, useSearchParams } from "react-router"
import { WorkspaceSwitcher } from "../features/workspace/WorkspaceSwitcher.tsx"
import { AccountMenu } from "./AccountMenu.tsx"
import styles from "./AppShell.module.css"
import { GlobalSearch } from "./GlobalSearch.tsx"
import { loadNavExpanded, saveNavExpanded } from "./nav-pref.ts"
import { SideNav } from "./SideNav.tsx"
import { TaskHosts } from "./TaskHosts.tsx"

const NAV_ID = "app-nav"

/**
 * Top bar (menu, workspace, search, create, account) over a left nav
 * strip that the menu button expands. On phones the nav is an overlay.
 */
export function AppShell() {
  const [expanded, setExpanded] = useState(loadNavExpanded) // UI preference
  const [mobileOpen, setMobileOpen] = useState(false) // ephemeral
  const [, setSearch] = useSearchParams()
  const { pathname } = useLocation()

  // Close the phone overlay after navigating.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs per route
  useEffect(() => setMobileOpen(false), [pathname])

  const toggle = () => {
    if (window.matchMedia?.("(max-width: 720px)").matches) {
      setMobileOpen((o) => !o)
      return
    }
    setExpanded((e) => {
      saveNavExpanded(!e)
      return !e
    })
  }
  const open = expanded || mobileOpen

  return (
    <div
      className={cx(
        styles.shell,
        expanded && styles.expanded,
        mobileOpen && styles.mobileOpen
      )}
    >
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.topbar}>
        <div className={styles.start}>
          <IconButton
            appearance="subtle"
            icon={<NavigationIcon />}
            aria-label={open ? "Collapse navigation" : "Expand navigation"}
            aria-expanded={open}
            aria-controls={NAV_ID}
            onClick={toggle}
          />
          <NavLink to="/" className={cx(styles.brand)} aria-label="List home">
            <span className={styles.logo} aria-hidden="true">
              L
            </span>
            <span className={styles.brandText}>List</span>
          </NavLink>
          <WorkspaceSwitcher />
        </div>
        <div className={styles.center}>
          <GlobalSearch />
        </div>
        <div className={styles.end}>
          <Button
            appearance="primary"
            icon={<AddIcon />}
            className={styles.create}
            onClick={() =>
              setSearch((s) => {
                const next = new URLSearchParams(s)
                next.set("create", "1")
                return next
              })
            }
          >
            <span className={styles.createText}>Create</span>
          </Button>
          <AccountMenu />
        </div>
      </header>
      <SideNav id={NAV_ID} expanded={expanded} mobileOpen={mobileOpen} />
      {mobileOpen && (
        <button
          type="button"
          className={styles.scrim}
          aria-label="Close navigation"
          onClick={() => setMobileOpen(false)}
        />
      )}
      <div className={styles.body}>
        <WorkerStatusBanner />
        <main id="main" className={styles.main} tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <TaskHosts />
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
