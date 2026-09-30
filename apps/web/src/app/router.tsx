import type { Bridge } from "@app/bridge"
import { createBrowserRouter, type RouteObject } from "react-router"
import { HomePage } from "../features/system/HomePage.tsx"
import { AppShell } from "./AppShell.tsx"
import { NotFoundPage, RouteErrorPage } from "./ErrorPages.tsx"

/**
 * Loaders only warm the worker (`bridge.prefetch`); they never fetch or
 * return data (ADR-0004). Components read data with `useView`.
 */
export function createAppRouter(bridge: Bridge) {
  const routes: RouteObject[] = [
    {
      path: "/",
      element: <AppShell />,
      errorElement: <RouteErrorPage />,
      children: [
        {
          index: true,
          element: <HomePage />,
          loader: () => {
            bridge.prefetch("system.info", {})
            return null
          },
        },
        ...(import.meta.env.DEV
          ? [
              {
                path: "_design",
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
      ],
    },
  ]
  return createBrowserRouter(routes)
}
