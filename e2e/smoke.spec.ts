import AxeBuilder from "@axe-core/playwright"
import { expect, type Page, test } from "@playwright/test"

/**
 * ADR-0005 guard: make every network API throw on the main thread. The page
 * can only show API data if the Dedicated Worker fetched it.
 */
async function forbidMainThreadNetwork(page: Page) {
  await page.addInitScript(() => {
    const forbid = (name: string) => () => {
      throw new Error(`${name} is forbidden on the main thread (ADR-0005)`)
    }
    Object.defineProperty(window, "fetch", { value: forbid("fetch") })
    Object.defineProperty(window, "XMLHttpRequest", {
      value: forbid("XMLHttpRequest"),
    })
    Object.defineProperty(window, "WebSocket", { value: forbid("WebSocket") })
    Object.defineProperty(window, "EventSource", {
      value: forbid("EventSource"),
    })
  })
}

function collectErrors(page: Page) {
  const errors: string[] = []
  page.on("pageerror", (e) => errors.push(e.message))
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text())
  })
  return errors
}

test.beforeEach(async ({ page }) => {
  await forbidMainThreadNetwork(page)
})

test("home shows API info computed in the worker", async ({ page }) => {
  const errors = collectErrors(page)
  const workerRequests: string[] = []
  page.on("request", (req) => {
    if (req.url().includes("/api/v1/")) workerRequests.push(req.url())
  })

  await page.goto("/")
  await expect(page.getByRole("heading", { name: "Welcome" })).toBeVisible()
  await expect(page.getByTestId("service")).toHaveText("list-api")
  await expect(page.getByText("0.1.0-e2e")).toBeVisible()
  await expect(page.getByText("Connected")).toBeVisible()

  expect(workerRequests.some((u) => u.endsWith("/api/v1/system/info"))).toBe(
    true
  )
  expect(page.workers().length).toBeGreaterThan(0)
  expect(errors).toEqual([])
})

test("design gallery renders and passes axe (light + dark)", async ({
  page,
}) => {
  // Reduced motion zeroes transition tokens, so axe never samples a colour
  // mid-transition after the theme switch.
  await page.emulateMedia({ reducedMotion: "reduce" })
  await page.goto("/_design")
  await expect(
    page.getByRole("heading", { name: "Design system" })
  ).toBeVisible()
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Theme").selectOption(theme)
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme)
    const results = await new AxeBuilder({ page }).analyze()
    expect(
      results.violations,
      `${theme}: ${JSON.stringify(results.violations, null, 2)}`
    ).toEqual([])
  }
})

test("theme preference persists across reloads", async ({ page }) => {
  await page.goto("/")
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

test("home passes axe", async ({ page }) => {
  await page.goto("/")
  await expect(page.getByTestId("service")).toBeVisible()
  const results = await new AxeBuilder({ page }).analyze()
  expect(results.violations).toEqual([])
})
