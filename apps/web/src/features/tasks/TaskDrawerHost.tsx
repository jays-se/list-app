import { useSearchParams } from "react-router"
import { TaskDetailDrawer } from "./TaskDetailDrawer.tsx"

/** Opens the task drawer for `?task=<id>` on any page (dashboard, calendar). */
export function TaskDrawerHost() {
  const [search, setSearch] = useSearchParams()
  const taskId = search.get("task")
  if (!taskId) return null
  return (
    <TaskDetailDrawer
      key={taskId}
      taskId={taskId}
      onClose={() =>
        setSearch((s) => {
          const next = new URLSearchParams(s)
          next.delete("task")
          return next
        })
      }
    />
  )
}
