import type { Bridge } from "@app/bridge"

/**
 * Main-thread errors go to the worker, which reports them to the API
 * (E12-S1). React renders only, so no network here (ADR-0005).
 */
export function installErrorReporting(bridge: Bridge): void {
  const report = (e: unknown) => {
    const err = e instanceof Error ? e : new Error(String(e))
    bridge.reportError({
      source: "main",
      message: err.message || err.name,
      ...(err.stack ? { stack: err.stack } : {}),
      url: window.location.pathname,
    })
  }
  window.addEventListener("error", (event) =>
    report(event.error ?? event.message)
  )
  window.addEventListener("unhandledrejection", (event) => report(event.reason))
}
