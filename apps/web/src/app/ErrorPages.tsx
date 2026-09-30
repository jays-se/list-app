import { useBridge } from "@app/bridge"
import { Button } from "@app/ui-kit"
import { useEffect } from "react"
import { isRouteErrorResponse, Link, useRouteError } from "react-router"
import styles from "./ErrorPages.module.css"

export function NotFoundPage() {
  return (
    <section className={styles.page} aria-labelledby="nf-title">
      <h1 id="nf-title" className={styles.title}>
        Page not found
      </h1>
      <p className={styles.text}>This address doesn't match any page.</p>
      <Link to="/">Go home</Link>
    </section>
  )
}

export function RouteErrorPage() {
  const error = useRouteError()
  const bridge = useBridge()
  useEffect(() => {
    if (isRouteErrorResponse(error)) return
    const err = error instanceof Error ? error : new Error(String(error))
    bridge.reportError({
      source: "main",
      message: err.message || err.name,
      ...(err.stack ? { stack: err.stack } : {}),
      url: window.location.pathname,
    })
  }, [bridge, error])
  const message = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : "Something went wrong while showing this page."
  return (
    <section className={styles.page} aria-labelledby="err-title">
      <h1 id="err-title" className={styles.title}>
        Something went wrong
      </h1>
      <p className={styles.text}>{message}</p>
      <Button appearance="primary" onClick={() => window.location.reload()}>
        Reload
      </Button>
    </section>
  )
}
