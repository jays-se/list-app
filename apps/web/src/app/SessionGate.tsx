import { useView } from "@app/bridge"
import { Navigate, Outlet, useLocation } from "react-router"
import { FullPageError, FullPageSpinner } from "./FullPageStatus.tsx"

/**
 * Route guard driven by the worker's `session.current` view (E3-S2):
 * - signed out            → /login?returnTo=<here>
 * - no active workspace   → /onboarding (when a workspace is needed)
 * - a workspace but on /onboarding → home (reference behaviour)
 */
export function RequireSession({ need }: { need: "user" | "workspace" }) {
  const session = useView("session.current", {})
  const location = useLocation()

  if (session.status === "loading" || (!session.data && session.isFetching)) {
    return <FullPageSpinner label="Loading your workspace" />
  }
  if (!session.data) {
    return <FullPageError message={session.error?.message} />
  }
  const { status } = session.data
  if (status === "anonymous") {
    const here = `${location.pathname}${location.search}`
    const search = here === "/" ? "" : `?returnTo=${encodeURIComponent(here)}`
    return <Navigate to={`/login${search}`} replace />
  }
  if (need === "workspace" && status === "needsWorkspace") {
    return <Navigate to="/onboarding" replace />
  }
  if (need === "user" && status === "ready") {
    return <Navigate to="/" replace />
  }
  return <Outlet />
}
