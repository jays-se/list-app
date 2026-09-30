import { useView } from "@app/bridge"
import { LinkButton, Spinner } from "@app/ui-kit"
import { Navigate, useSearchParams } from "react-router"
import { ThemeSwitcher } from "../../app/ThemeSwitcher.tsx"
import styles from "./LoginPage.module.css"

/** Messages for `/login?error=` (set by the API callback; reference parity). */
const ERRORS: Record<string, string> = {
  state: "Sign-in expired. Please try again.",
  denied: "Sign-in was cancelled.",
  oauth: "Sign-in failed. Please try again.",
  internal: "Something went wrong signing you in.",
}

/** Only same-site paths are forwarded (the API re-checks, ADR-0017). */
function safeReturnTo(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/"
}

export function LoginPage() {
  const [params] = useSearchParams()
  const session = useView("session.current", {})
  const returnTo = safeReturnTo(params.get("returnTo"))
  const error = params.get("error")

  if (session.data && session.data.status !== "anonymous") {
    return <Navigate to={returnTo} replace />
  }

  const href = `/api/v1/auth/google/login?returnTo=${encodeURIComponent(returnTo)}`
  return (
    <div className={styles.page}>
      <header className={styles.corner}>
        <ThemeSwitcher />
      </header>
      <main className={styles.card} aria-labelledby="login-title">
        <p className={styles.brand}>List</p>
        <h1 id="login-title" className={styles.title}>
          Sign in
        </h1>
        <p className={styles.lead}>
          Your team's action items, approvals and docs in one place.
        </p>
        {error && (
          <p role="alert" className={styles.error}>
            {ERRORS[error] ?? ERRORS.internal}
          </p>
        )}
        {session.status === "loading" ? (
          <Spinner label="Checking your session" />
        ) : (
          <LinkButton
            href={href}
            appearance="primary"
            size="large"
            className={styles.cta}
          >
            Continue with Google
          </LinkButton>
        )}
      </main>
    </div>
  )
}
