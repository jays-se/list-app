import { useAction, useView } from "@app/bridge"
import { Dropdown } from "@app/ui-kit"
import styles from "./WorkspaceSwitcher.module.css"

/**
 * Switching runs in the worker: it resets all cached data and refetches
 * every live view (ADR-0019), so this component only picks the id.
 */
export function WorkspaceSwitcher() {
  const session = useView("session.current", {})
  const switchTo = useAction("workspaces.switch")
  const vm = session.data
  if (!vm?.activeWorkspace) return null

  return (
    <span className={styles.root}>
      <Dropdown
        aria-label="Workspace"
        size="small"
        appearance="subtle"
        className={styles.dropdown}
        value={vm.activeWorkspace.id}
        disabled={switchTo.pending}
        options={vm.workspaces.map((w) => ({
          value: w.id,
          label: w.name,
          description: w.roleLabel,
          media: (
            <span className={styles.mark} aria-hidden="true">
              {w.name.slice(0, 1).toUpperCase()}
            </span>
          ),
        }))}
        onChange={(workspaceId) =>
          switchTo.run({ workspaceId }).catch(() => {})
        }
      />
      {switchTo.error && (
        <span role="alert" className={styles.error}>
          {switchTo.error.message}
        </span>
      )}
    </span>
  )
}
