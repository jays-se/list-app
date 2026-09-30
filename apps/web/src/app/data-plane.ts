import { Bridge, createWorkerBackend } from "@app/bridge"

/** Starts the data-plane worker and returns the bridge React talks to. */
export function startDataPlane(): Bridge {
  const bridge = new Bridge(
    createWorkerBackend(
      () =>
        new Worker(new URL("../worker/data-plane.worker.ts", import.meta.url), {
          type: "module",
          name: "data-plane",
        })
    )
  )
  document.addEventListener("visibilitychange", () => {
    bridge.setVisible(document.visibilityState === "visible")
  })
  return bridge
}
