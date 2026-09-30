import { useAction, useView } from "@app/bridge"
import {
  Avatar,
  applyTheme,
  BellIcon,
  InfoIcon,
  loadTheme,
  Menu,
  type MenuItem,
  SettingsIcon,
  SignOutIcon,
  saveTheme,
  type ThemeName,
} from "@app/ui-kit"
import { useState } from "react"
import { useNavigate } from "react-router"
import styles from "./AccountMenu.module.css"
import { THEME_OPTIONS as THEMES } from "./ThemeSwitcher.tsx"

/**
 * Only the avatar (initials) sits in the top bar; who you are, theme,
 * settings and sign out live in its menu.
 */
export function AccountMenu() {
  const session = useView("session.current", {})
  const logout = useAction("auth.logout")
  const navigate = useNavigate()
  const [theme, setTheme] = useState<ThemeName>(loadTheme) // UI preference
  const user = session.data?.user
  const workspace = session.data?.activeWorkspace
  if (!user) return null

  const items: MenuItem[] = [
    { kind: "group", key: "theme", label: "Theme" },
    ...THEMES.map(
      (t): MenuItem => ({
        kind: "radio",
        key: `theme-${t.value}`,
        label: t.label,
        checked: theme === t.value,
        onSelect: () => {
          setTheme(t.value)
          applyTheme(t.value)
          saveTheme(t.value)
        },
      })
    ),
    { kind: "separator", key: "s1" },
    {
      key: "workspace",
      label: "Workspace settings",
      icon: <SettingsIcon size={16} />,
      onSelect: () => navigate("/settings/workspace"),
    },
    {
      key: "notifications",
      label: "Notification settings",
      icon: <BellIcon size={16} />,
      onSelect: () => navigate("/settings/notifications"),
    },
    {
      key: "about",
      label: "About",
      icon: <InfoIcon size={16} />,
      onSelect: () => navigate("/settings/about"),
    },
    { kind: "separator", key: "s2" },
    {
      key: "signout",
      label: "Sign out",
      icon: <SignOutIcon size={16} />,
      disabled: logout.pending,
      // The session guard redirects to /login once the worker reports "anonymous".
      onSelect: () => void logout.run({}).catch(() => {}),
    },
  ]

  return (
    <Menu
      label="Account"
      align="end"
      items={items}
      header={
        <div className={styles.who}>
          <Avatar name={user.name} image={user.image ?? undefined} size={40} />
          <div className={styles.text}>
            <span className={styles.name}>{user.name}</span>
            <span className={styles.muted}>{user.email}</span>
            {workspace && (
              <span className={styles.muted}>
                {workspace.roleLabel} · {workspace.name}
              </span>
            )}
          </div>
        </div>
      }
      trigger={(props) => (
        <button
          type="button"
          {...props}
          aria-label={`Account: ${user.name}`}
          className={styles.trigger}
        >
          <Avatar name={user.name} image={user.image ?? undefined} size={32} />
        </button>
      )}
    />
  )
}
