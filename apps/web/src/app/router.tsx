import type { Bridge } from "@app/bridge"
import { createBrowserRouter, Navigate, type RouteObject } from "react-router"
import { LoginPage } from "../features/auth/LoginPage.tsx"
import { CalendarPage } from "../features/calendar/CalendarPage.tsx"
import { CapturePage } from "../features/capture/CapturePage.tsx"
import { ClientDetailPage } from "../features/clients/ClientDetailPage.tsx"
import { ClientsPage } from "../features/clients/ClientsPage.tsx"
import { DashboardPage } from "../features/dashboard/DashboardPage.tsx"
import { DocPage } from "../features/docs/DocPage.tsx"
import { DocsPage } from "../features/docs/DocsPage.tsx"
import { InboxPage, inboxParams } from "../features/inbox/InboxPage.tsx"
import { AboutPage } from "../features/settings/AboutPage.tsx"
import { NotificationSettingsPage } from "../features/settings/NotificationSettingsPage.tsx"
import { SettingsLayout } from "../features/settings/SettingsLayout.tsx"
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
              element: <DashboardPage />,
              loader: () => {
                bridge.prefetch("dashboard.summary", {})
                return null
              },
            },
            {
              path: "/calendar",
              element: <CalendarPage />,
              loader: ({ request }) => {
                const month = new URL(request.url).searchParams.get("month")
                bridge.prefetch("calendar.month", month ? { month } : {})
                return null
              },
            },
            { path: "/capture", element: <CapturePage /> },
            {
              path: "/docs",
              element: <DocsPage />,
              loader: () => {
                bridge.prefetch("docs.list", {})
                return null
              },
            },
            {
              path: "/docs/:docId",
              element: <DocPage />,
              loader: ({ params }) => {
                if (params.docId)
                  bridge.prefetch("docs.detail", { docId: params.docId })
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
              path: "/clients",
              element: <ClientsPage />,
              loader: () => {
                bridge.prefetch("clients.list", {})
                return null
              },
            },
            {
              path: "/clients/:clientId",
              element: <ClientDetailPage />,
              loader: ({ params }) => {
                if (params.clientId)
                  bridge.prefetch("clients.detail", {
                    clientId: params.clientId,
                  })
                return null
              },
            },
            {
              path: "/inbox",
              element: <InboxPage />,
              loader: ({ request }) => {
                bridge.prefetch(
                  "inbox.list",
                  inboxParams(new URL(request.url).searchParams)
                )
                return null
              },
            },
            {
              path: "/settings",
              element: <SettingsLayout />,
              children: [
                { index: true, element: <Navigate to="workspace" replace /> },
                {
                  path: "workspace",
                  element: <WorkspaceSettingsPage />,
                  loader: () => {
                    bridge.prefetch("workspace.members", {})
                    return null
                  },
                },
                {
                  path: "notifications",
                  element: <NotificationSettingsPage />,
                  loader: () => {
                    bridge.prefetch("notifications.settings", {})
                    return null
                  },
                },
                {
                  path: "about",
                  element: <AboutPage />,
                  loader: () => {
                    bridge.prefetch("system.info", {})
                    return null
                  },
                },
              ],
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
