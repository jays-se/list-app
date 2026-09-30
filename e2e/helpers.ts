import AxeBuilder from "@axe-core/playwright"
import { expect, type Locator, type Page } from "@playwright/test"

/**
 * ADR-0005 guard: make every network API throw on the main thread. The page
 * can only show API data if the Dedicated Worker fetched it.
 */
export async function forbidMainThreadNetwork(page: Page) {
  await page.addInitScript(() => {
    const forbid = (name: string) => () => {
      throw new Error(`${name} is forbidden on the main thread (ADR-0005)`)
    }
    for (const name of [
      "fetch",
      "XMLHttpRequest",
      "WebSocket",
      "EventSource",
    ]) {
      Object.defineProperty(window, name, { value: forbid(name) })
    }
  })
}

export function collectErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  return errors
}

let counter = 0
/** A unique person per test so runs never collide in the shared database. */
export function uniquePerson(first: string) {
  const id = `${Date.now().toString(36)}${(counter++).toString(36)}${Math.random().toString(36).slice(2, 6)}`
  return {
    name: `${first} Tester`,
    email: `${first.toLowerCase()}.${id}@e2e.test`,
  }
}

/** Signs in through the dev identity provider (ADR-0017). */
export async function signIn(
  page: Page,
  person: { name: string; email: string },
  path = "/"
) {
  await page.goto(path)
  await expect(page).toHaveURL(/\/login/)
  await page.getByRole("link", { name: "Continue with Google" }).click()
  await expect(page.getByRole("heading", { name: "Dev sign-in" })).toBeVisible()
  await page.getByLabel("Name").fill(person.name)
  await page.getByLabel("Email").fill(person.email)
  await page.getByRole("button", { name: "Sign in" }).click()
}

export async function createWorkspace(page: Page, name: string) {
  await page.getByRole("textbox", { name: /Workspace name/ }).fill(name)
  await page.getByRole("button", { name: "Create workspace" }).click()
}

export async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).analyze()
  expect(
    results.violations,
    `${label}: ${JSON.stringify(results.violations, null, 2)}`
  ).toEqual([])
}

type Scope = Page | Locator
const pageOf = (scope: Scope): Page =>
  "context" in scope && typeof scope.context === "function"
    ? (scope as Page)
    : (scope as Locator).page()

/** Picks one option in a ui-kit Dropdown (a combobox + listbox popover). */
export async function choose(
  scope: Scope,
  name: string | RegExp,
  option: string | RegExp
) {
  await scope
    .getByRole("combobox", { name, exact: typeof name === "string" })
    .click()
  await pageOf(scope)
    .getByRole("option", { name: option, exact: typeof option === "string" })
    .click()
}

/** Toggles options in a MultiDropdown, then closes it. */
export async function chooseMany(
  scope: Scope,
  name: string | RegExp,
  options: (string | RegExp)[]
) {
  const box = scope.getByRole("combobox", {
    name,
    exact: typeof name === "string",
  })
  await box.click()
  const page = pageOf(scope)
  for (const option of options) {
    await page.getByRole("option", { name: option }).click()
  }
  await box.press("Escape")
}

/** Sign out lives in the account (avatar) menu. */
export async function signOut(page: Page) {
  await page.getByRole("button", { name: /^Account:/ }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
}
