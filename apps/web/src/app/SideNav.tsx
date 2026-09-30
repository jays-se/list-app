import { useView } from "@app/bridge"
import {
  AppsIcon,
  BuildingIcon,
  CalendarIcon,
  cx,
  DocumentIcon,
  FlashIcon,
  HomeIcon,
  InboxIcon,
  SettingsIcon,
  TaskListIcon,
} from "@app/ui-kit"
import type { ReactNode } from "react"
import { NavLink } from "react-router"
import styles from "./SideNav.module.css"

interface Item {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

const MAIN: Item[] = [
  { to: "/", label: "Home", icon: <HomeIcon />, end: true },
  { to: "/tasks", label: "Tasks", icon: <TaskListIcon /> },
  { to: "/calendar", label: "Calendar", icon: <CalendarIcon /> },
  { to: "/capture", label: "Capture", icon: <FlashIcon /> },
  { to: "/docs", label: "Docs", icon: <DocumentIcon /> },
  { to: "/clients", label: "Clients", icon: <BuildingIcon /> },
]

/**
 * Icon strip that grows to show labels. Labels stay in the DOM (visually
 * hidden when collapsed) so every link keeps its accessible name, and a
 * tooltip (`title`) names it for pointer users.
 */
export function SideNav({
  id,
  expanded: wide,
  mobileOpen,
}: {
  id: string
  expanded: boolean
  mobileOpen: boolean
}) {
  // The phone overlay always shows labels.
  const expanded = wide || mobileOpen
  return (
    <nav
      id={id}
      aria-label="Primary"
      className={cx(
        styles.nav,
        wide && styles.expanded,
        mobileOpen && styles.open
      )}
    >
      <ul className={styles.list}>
        {MAIN.map((item) => (
          <li key={item.to}>
            <NavItem item={item} expanded={expanded} />
          </li>
        ))}
        <li>
          <InboxItem expanded={expanded} />
        </li>
      </ul>
      <ul className={cx(styles.list, styles.bottom)}>
        <li>
          <NavItem
            item={{
              to: "/settings",
              label: "Settings",
              icon: <SettingsIcon />,
            }}
            expanded={expanded}
          />
        </li>
        {import.meta.env.DEV && (
          <li>
            <NavItem
              item={{
                to: "/_design",
                label: "Design system",
                icon: <AppsIcon />,
              }}
              expanded={expanded}
            />
          </li>
        )}
      </ul>
    </nav>
  )
}

function NavItem({
  item,
  expanded,
  badge,
  ariaLabel,
}: {
  item: Item
  expanded: boolean
  badge?: string | null | undefined
  ariaLabel?: string | undefined
}) {
  return (
    <NavLink
      to={item.to}
      end={item.end ?? false}
      title={expanded ? undefined : item.label}
      aria-label={ariaLabel}
      className={({ isActive }) => cx(styles.link, isActive && styles.active)}
    >
      <span className={styles.icon} aria-hidden="true">
        {item.icon}
        {badge && !expanded && <span className={styles.dotBadge} />}
      </span>
      <span className={styles.label}>{item.label}</span>
      {badge && expanded && (
        <span className={styles.badge} aria-hidden="true">
          {badge}
        </span>
      )}
    </NavLink>
  )
}

/** Polls with the inbox (20 s); the count comes from the worker. */
function InboxItem({ expanded }: { expanded: boolean }) {
  const badge = useView("inbox.badge", {}).data
  return (
    <NavItem
      item={{ to: "/inbox", label: "Inbox", icon: <InboxIcon /> }}
      expanded={expanded}
      badge={badge?.badgeText}
      ariaLabel={badge?.label}
    />
  )
}
