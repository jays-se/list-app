import { useSearchParams } from "react-router"
import { CreateTaskDrawer } from "../features/tasks/CreateTaskDrawer.tsx"
import { TaskDetailDrawer } from "../features/tasks/TaskDetailDrawer.tsx"

/**
 * `?create=1` opens "New task" and `?task=<id>` opens a task, on any page
 * (top-bar Create, search results, dashboard, calendar, lists).
 */
export function TaskHosts() {
  const [search, setSearch] = useSearchParams()
  const taskId = search.get("task")
  const creating = search.get("create") === "1"
  const update = (edit: (next: URLSearchParams) => void) =>
    setSearch((s) => {
      const next = new URLSearchParams(s)
      edit(next)
      return next
    })

  if (creating) {
    return (
      <CreateTaskDrawer
        onClose={(createdId) =>
          update((s) => {
            s.delete("create")
            if (createdId) s.set("task", createdId)
          })
        }
      />
    )
  }
  if (!taskId) return null
  return (
    <TaskDetailDrawer
      key={taskId}
      taskId={taskId}
      onClose={() => update((s) => s.delete("task"))}
    />
  )
}
