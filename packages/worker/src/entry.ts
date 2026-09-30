/// <reference lib="webworker" />
/**
 * Dedicated Worker entry: the app's data plane (ADR-0005). The web app loads
 * this through `apps/web/src/worker/data-plane.worker.ts`.
 */
import type { ToMain } from "@app/protocol"
import { createKernel } from "./create-kernel.ts"

declare const self: DedicatedWorkerGlobalScope

const post = (message: ToMain) => self.postMessage(message)

const kernel = createKernel({ post, locale: self.navigator.language })

self.addEventListener("message", (event: MessageEvent<unknown>) => {
  kernel.handle(event.data)
})

self.addEventListener("unhandledrejection", (event) => {
  console.error("[worker] unhandled rejection", event.reason)
})
