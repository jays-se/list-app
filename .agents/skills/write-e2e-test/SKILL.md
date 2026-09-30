---
name: write-e2e-test
description: Write a Playwright end-to-end test against the real Go API + PostgreSQL + worker data plane, signing in through the dev identity provider, with the main-thread network guard and axe checks. Use for every user-facing story's happy path.
---

# Write an e2e test

Reference implementations:
- `e2e/auth-workspaces.spec.ts`
- `e2e/helpers.ts`

## Setup (already configured in `playwright.config.ts`)
- The config builds and migrates the real API (`AUTH_PROVIDER=dev`, port 18080), then starts Vite on port 5199.
- It requires `E2E_DATABASE_URL`. CI provides Postgres; locally, see `docs/local-setup.md`.
- The database is shared and never reset, so **every test creates its own people and workspaces** with `uniquePerson("Name")`.

## Rules
1. Call `forbidMainThreadNetwork(page)` in `beforeEach`, and on every extra page or context you open. It proves the worker did the fetching (ADR-0005).
2. Sign in with `signIn(page, uniquePerson("Ada"), "/optional/deep/link")`. This drives the dev provider's HTML form.
3. Use several people with `browser.newContext()`: one context per person, each with its own cookies.
4. Write locators by role and accessible name (`getByRole`, `getByLabel`). The `<option>`s of a `<select>` also match `getByText`, so assert page text through `getByRole("main")` with `toContainText` instead.
5. Accessibility:
   - Call `page.emulateMedia({ reducedMotion: "reduce" })` before `expectNoAxeViolations(page, "label")`.
   - Run axe once per new screen, and in both themes for design-heavy pages.
6. Never use `waitForTimeout` for correctness. Wait for UI state with `expect(…).toBeVisible()` or `toHaveURL()`.
7. Check `collectErrors(page)` is empty at the end of the main happy path.

## Run
```sh
E2E_DATABASE_URL=postgres://… pnpm test:e2e             # all
E2E_DATABASE_URL=postgres://… pnpm test:e2e -g "invite"  # one test
```
