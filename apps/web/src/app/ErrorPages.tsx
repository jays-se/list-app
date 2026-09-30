import { Button } from "@app/ui-kit"
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
