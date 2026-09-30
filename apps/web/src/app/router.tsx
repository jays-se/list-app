import type { Bridge } from "@app/bridge"
import { createBrowserRouter, type RouteObject } from "react-router"
import { LoginPage } from "../features/auth/LoginPage.tsx"
import { HomePage } from "../features/system/HomePage.tsx"
import { listParams, TasksPage } from "../features/tasks/TasksPage.tsx"
import { OnboardingPage } from "../features/workspace/OnboardingPage.tsx"
import { WorkspaceSettingsPage } from "../features/workspace/WorkspaceSettingsPage.tsx"
import { AppShell } from "./AppShell.tsx"
import { NotFoundPage, RouteErrorPage } from "./ErrorPages.tsx"
import { RequireSession } from "./SessionGate.tsx"

/**
 * Loaders only warm the worker (`bridge.prefetch`); they never fetch or
 * return data (ADR-0004). Guards and pages read data with `useView`.
 */
export function createAppRoutes(bridge: Bridge): RouteObject[] {
  const warm = () => {
    bridge.prefetch("session.current", {})
    return null
  }
  return [
    { path: "/login", element: <LoginPage />, loader: warm },
    {
      element: <RequireSession need="user" />,
      errorElement: <RouteErrorPage />,
      loader: warm,
      children: [{ path: "/onboarding", element: <OnboardingPage /> }],
    },
    {
      element: <RequireSession need="workspace" />,
      errorElement: <RouteErrorPage />,
      loader: warm,
      children: [
        {
          element: <AppShell />,
          children: [
            {
              index: true,
              element: <HomePage />,
              loader: () => {
                bridge.prefetch("system.info", {})
                return null
              },
            },
            {
              path: "/tasks",
              element: <TasksPage />,
              loader: ({ request }) => {
                const search = new URL(request.url).searchParams
                bridge.prefetch("tasks.list", listParams(search))
                const taskId = search.get("task")
                if (taskId) bridge.prefetch("tasks.detail", { taskId })
                return null
              },
            },
            {
              path: "/settings/workspace",
              element: <WorkspaceSettingsPage />,
              loader: () => {
                bridge.prefetch("workspace.members", {})
                return null
              },
            },
          ],
        },
      ],
    },
    ...(import.meta.env.DEV
      ? [
          {
            path: "/_design",
            lazy: async () => {
              const { DesignGallery } = await import(
                "../features/design/DesignGallery.tsx"
              )
              return { Component: DesignGallery }
            },
          },
        ]
      : []),
    { path: "*", element: <NotFoundPage /> },
  ]
}

export function createAppRouter(bridge: Bridge) {
  return createBrowserRouter(createAppRoutes(bridge))
}
