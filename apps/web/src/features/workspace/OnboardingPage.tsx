import { useAction, useView } from "@app/bridge"
import { Button } from "@app/ui-kit"
import { useNavigate } from "react-router"
import { ThemeSwitcher } from "../../app/ThemeSwitcher.tsx"
import styles from "./OnboardingPage.module.css"
import { CreateWorkspaceForm, JoinWorkspaceForm } from "./WorkspaceForms.tsx"

/** First run: create a workspace or join one by invite code (E3-S4). */
export function OnboardingPage() {
  const session = useView("session.current", {})
  const logout = useAction("auth.logout")
  const navigate = useNavigate()
  const goHome = () => navigate("/", { replace: true })
  const firstName = session.data?.user?.firstName

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <span className={styles.brand}>List</span>
        <span className={styles.spacer} />
        <ThemeSwitcher />
        <Button
          appearance="subtle"
          onClick={() => logout.run({}).catch(() => {})}
        >
          Sign out
        </Button>
      </header>
      <main className={styles.main} aria-labelledby="onboarding-title">
        <h1 id="onboarding-title" className={styles.title}>
          {firstName ? `Welcome, ${firstName}` : "Welcome"}
        </h1>
        <p className={styles.lead}>
          Workspaces keep a team's tasks and docs together. Start one, or join
          your team's.
        </p>
        <div className={styles.grid}>
          <section className={styles.card} aria-labelledby="create-title">
            <h2 id="create-title" className={styles.cardTitle}>
              Create a workspace
            </h2>
            <CreateWorkspaceForm onDone={goHome} />
          </section>
          <section className={styles.card} aria-labelledby="join-title">
            <h2 id="join-title" className={styles.cardTitle}>
              Join with an invite code
            </h2>
            <JoinWorkspaceForm onDone={goHome} />
          </section>
        </div>
      </main>
    </div>
  )
}
