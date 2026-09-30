import { useAction, useView } from "@app/bridge"
import { Select } from "@app/ui-kit"
import { useId } from "react"
import styles from "./WorkspaceSwitcher.module.css"

/**
 * Switching runs in the worker: it resets all cached data and refetches
 * every live view (ADR-0019), so this component only picks the id.
 */
export function WorkspaceSwitcher() {
  const id = useId()
  const session = useView("session.current", {})
  const switchTo = useAction("workspaces.switch")
  const vm = session.data
  if (!vm?.activeWorkspace) return null

  return (
    <span className={styles.root}>
      <label htmlFor={id} className="visually-hidden">
        Workspace
      </label>
      <Select
        id={id}
        size="small"
        appearance="filled"
        value={vm.activeWorkspace.id}
        disabled={switchTo.pending}
        onChange={(e) =>
          switchTo.run({ workspaceId: e.target.value }).catch(() => {})
        }
      >
        {vm.workspaces.map((w) => (
          <option key={w.id} value={w.id}>
            {w.name}
          </option>
        ))}
      </Select>
      {switchTo.error && (
        <span role="alert" className={styles.error}>
          {switchTo.error.message}
        </span>
      )}
    </span>
  )
}
