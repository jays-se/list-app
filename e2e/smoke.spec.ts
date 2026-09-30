import { expect, test } from "@playwright/test"
import {
  collectErrors,
  createWorkspace,
  expectNoAxeViolations,
  forbidMainThreadNetwork,
  signIn,
  uniquePerson,
} from "./helpers.ts"

test.beforeEach(async ({ page }) => {
  await forbidMainThreadNetwork(page)
})

test("home shows API info computed in the worker", async ({ page }) => {
  const errors = collectErrors(page)
  await signIn(page, uniquePerson("Smoke"))
  await createWorkspace(page, "Smoke workspace")
  await expect(page.getByRole("heading", { name: "Hi, Smoke" })).toBeVisible()
  await expect(page.getByTestId("service")).toHaveText("list-api")
  await expect(page.getByText("0.1.0-e2e")).toBeVisible()
  await expect(page.getByText("Connected")).toBeVisible()
  expect(page.workers().length).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test("design gallery is public and passes axe (light + dark)", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/_design")
  await expect(
    page.getByRole("heading", { name: "Design system" })
  ).toBeVisible()
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Theme").selectOption(theme)
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
    await expectNoAxeViolations(page, `design ${theme}`)
  }
})

test("theme preference persists across reloads", async ({ page }) => {
  await page.goto("/login")
  await page.getByLabel("Theme").selectOption("hc")
  await page.reload()
  await expect(page.locator("html")).toHaveAttribute("data-theme", "hc")
  await expect(page.getByLabel("Theme")).toHaveValue("hc")
})

test("unknown routes show a not-found page", async ({ page }) => {
  await page.goto("/does-not-exist")
  await expect(
    page.getByRole("heading", { name: "Page not found" })
  ).toBeVisible()
})
