import "@app/ui-kit/styles.css"
import { BridgeProvider } from "@app/bridge"
import { applyTheme, loadTheme } from "@app/ui-kit"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { RouterProvider } from "react-router"
import { startDataPlane } from "./app/data-plane.ts"
import { createAppRouter } from "./app/router.tsx"

applyTheme(loadTheme())

const bridge = startDataPlane()
const router = createAppRouter(bridge)
const root = document.getElementById("root")
if (!root) throw new Error("#root is missing from index.html")

createRoot(root).render(
  <StrictMode>
    <BridgeProvider bridge={bridge}>
      <RouterProvider router={router} />
    </BridgeProvider>
  </StrictMode>
)
