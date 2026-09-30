import { useView } from "@app/bridge"
import type { TaskListParams } from "@app/protocol"
import { AddIcon, Button, Spinner } from "@app/ui-kit"
import { useLocation, useNavigation, useSearchParams } from "react-router"
import { CreateTaskDrawer } from "./CreateTaskDrawer.tsx"
import { TaskDetailDrawer } from "./TaskDetailDrawer.tsx"
import { TaskFilters } from "./TaskFilters.tsx"
import { TaskGroups } from "./TaskGroups.tsx"
import styles from "./TasksPage.module.css"

const FILTER_KEYS = [
  "status",
  "mine",
  "assigneeId",
  "labelId",
  "clientId",
] as const

/** URL search params → view params (the worker validates the values). */
export function listParams(search: URLSearchParams): TaskListParams {
  const params: TaskListParams = {}
  for (const key of FILTER_KEYS) {
    const value = search.get(key)
    if (value) params[key] = value
  }
  return params
}

/** /tasks — list (E4-S2); ?task=<id> opens detail, ?create=1 opens create. */
export function TasksPage() {
  const [committed, setSearch] = useSearchParams()
  // Optimistic UI (react-router pattern): while a same-page navigation is
  // pending, render the URL it is heading to so controls respond instantly.
  const pending = useNavigation().location
  const { pathname } = useLocation()
  const search =
    pending && pending.pathname === pathname
      ? new URLSearchParams(pending.search)
      : committed
  const list = useView("tasks.list", listParams(search), { keepPrevious: true })
  const taskId = search.get("task")
  const creating = search.get("create") === "1"

  const updateSearch = (edit: (next: URLSearchParams) => void) => {
    const next = new URLSearchParams(search)
    edit(next)
    setSearch(next)
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Tasks</h1>
          {list.data && <p className={styles.count}>{list.data.totalText}</p>}
        </div>
        <Button
          appearance="primary"
          icon={<AddIcon />}
          onClick={() => updateSearch((s) => s.set("create", "1"))}
        >
          New task
        </Button>
      </header>

      {list.data && (
        <TaskFilters
          filters={list.data.filters}
          search={search}
          onChange={(key, value) =>
            updateSearch((s) => {
              if (value) s.set(key, value)
              else s.delete(key)
              if (key === "mine" && value) s.delete("assigneeId")
            })
          }
          onClear={() =>
            updateSearch((s) => {
              for (const k of FILTER_KEYS) s.delete(k)
            })
          }
        />
      )}

      {list.status === "loading" && <Spinner label="Loading tasks" />}
      {list.error && !list.data && (
        <p role="alert" className={styles.error}>
          {list.error.message}
        </p>
      )}
      {list.data?.isEmpty && (
        <div className={styles.empty}>
          <h2 className={styles.emptyTitle}>{list.data.emptyTitle}</h2>
          <p className={styles.emptyText}>{list.data.emptyText}</p>
        </div>
      )}
      {list.data && !list.data.isEmpty && (
        <TaskGroups groups={list.data.groups} search={search} />
      )}

      {creating && (
        <CreateTaskDrawer
          onClose={(createdId) =>
            updateSearch((s) => {
              s.delete("create")
              if (createdId) s.set("task", createdId)
            })
          }
        />
      )}
      {taskId && !creating && (
        <TaskDetailDrawer
          key={taskId}
          taskId={taskId}
          onClose={() => updateSearch((s) => s.delete("task"))}
        />
      )}
    </div>
  )
}
