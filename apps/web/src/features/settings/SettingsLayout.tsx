import { BellIcon, cx, InfoIcon, SettingsIcon } from "@app/ui-kit"
import { NavLink, Outlet } from "react-router"
import styles from "./Settings.module.css"

const TABS = [
  {
    to: "/settings/workspace",
    label: "Workspace",
    icon: <SettingsIcon size={16} />,
  },
  {
    to: "/settings/notifications",
    label: "Notifications",
    icon: <BellIcon size={16} />,
  },
  { to: "/settings/about", label: "About", icon: <InfoIcon size={16} /> },
]

/** /settings/* — one place for workspace, notification and app settings. */
export function SettingsLayout() {
  return (
    <div className={styles.layout}>
      <nav aria-label="Settings" className={styles.tabs}>
        {TABS.map((t) => (
          <NavLink
            key={t.to}
            to={t.to}
            className={({ isActive }) =>
              cx(styles.tab, isActive && styles.active)
            }
          >
            <span aria-hidden="true" className={styles.tabIcon}>
              {t.icon}
            </span>
            {t.label}
          </NavLink>
        ))}
      </nav>
      <div className={styles.content}>
        <Outlet />
      </div>
    </div>
  )
}
