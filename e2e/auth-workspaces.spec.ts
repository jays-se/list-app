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
  await page.emulateMedia({ reducedMotion: "reduce" })
})

test("first sign-in → onboarding → create workspace → home", async ({
  page,
}) => {
  const errors = collectErrors(page)
  await page.goto("/login")
  await expectNoAxeViolations(page, "login")

  await signIn(page, uniquePerson("Ada"))
  await expect(page).toHaveURL(/\/onboarding$/)
  await expect(
    page.getByRole("heading", { name: "Welcome, Ada" })
  ).toBeVisible()
  await expectNoAxeViolations(page, "onboarding")

  // Validation runs in the worker; nothing is sent.
  await page.getByRole("button", { name: "Create workspace" }).click()
  await expect(page.getByText("Workspace name is required")).toBeVisible()

  await createWorkspace(page, "Acme")
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole("main")).toContainText("You're in Acme")
  await expect(page.getByRole("combobox", { name: "Workspace" })).toHaveValue(
    /.+/
  )
  expect(errors).toEqual([])
})

test("deep link survives sign-in (returnTo)", async ({ page }) => {
  const person = uniquePerson("Grace")
  await signIn(page, person)
  await createWorkspace(page, "Deep link co")
  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/login$/)

  await signIn(page, person, "/settings/workspace")
  await expect(page).toHaveURL(/\/settings\/workspace$/)
  await expect(
    page.getByRole("heading", { name: "Deep link co" })
  ).toBeVisible()
})

test("a second person joins with the invite code; owner rotates it", async ({
  browser,
}) => {
  const ownerPage = await (await browser.newContext()).newPage()
  const memberPage = await (await browser.newContext()).newPage()
  const latePage = await (await browser.newContext()).newPage()
  for (const p of [ownerPage, memberPage, latePage])
    await forbidMainThreadNetwork(p)

  await signIn(ownerPage, uniquePerson("Owner"))
  await createWorkspace(ownerPage, "Team Rocket")
  await ownerPage.getByRole("link", { name: "Settings" }).click()
  const code =
    (await ownerPage.getByTestId("invite-code").textContent())?.trim() ?? ""
  expect(code).toHaveLength(26)
  await ownerPage.emulateMedia({ reducedMotion: "reduce" })
  await expectNoAxeViolations(ownerPage, "settings")

  await signIn(memberPage, uniquePerson("Member"))
  await memberPage
    .getByRole("textbox", { name: /Invite code/ })
    .fill("not-a-real-code")
  await memberPage.getByRole("button", { name: "Join workspace" }).click()
  await expect(
    memberPage.getByText("That invite code isn't valid.")
  ).toBeVisible()
  await memberPage.getByRole("textbox", { name: /Invite code/ }).fill(code)
  await memberPage.getByRole("button", { name: "Join workspace" }).click()
  await expect(memberPage.getByRole("main")).toContainText(
    "You're in Team Rocket"
  )

  // Members see each other; only the owner can rotate.
  await memberPage.getByRole("link", { name: "Settings" }).click()
  await expect(memberPage.getByText("2 members")).toBeVisible()
  await expect(
    memberPage.getByRole("button", { name: "Generate new code" })
  ).toHaveCount(0)

  await ownerPage.reload()
  await ownerPage.getByRole("button", { name: "Generate new code" }).click()
  await expect(ownerPage.getByTestId("invite-code")).not.toHaveText(code)

  await signIn(latePage, uniquePerson("Late"))
  await latePage.getByRole("textbox", { name: /Invite code/ }).fill(code)
  await latePage.getByRole("button", { name: "Join workspace" }).click()
  await expect(
    latePage.getByText("That invite code isn't valid.")
  ).toBeVisible()
})

test("switching workspaces and signing out", async ({ page }) => {
  await signIn(page, uniquePerson("Switch"))
  await createWorkspace(page, "Alpha")
  await expect(page.getByRole("main")).toContainText("You're in Alpha")
  await page.getByRole("link", { name: "Settings" }).click()
  await createWorkspace(page, "Bravo")
  const switcher = page.getByRole("combobox", { name: "Workspace" })
  await expect(page.getByRole("heading", { name: "Bravo" })).toBeVisible()

  await switcher.selectOption({ label: "Alpha" })
  await expect(page.getByRole("heading", { name: "Alpha" })).toBeVisible()

  await page.getByRole("button", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings%2Fworkspace$/)
  await expect(
    page.getByRole("link", { name: "Continue with Google" })
  ).toBeVisible()
  await page.goto("/settings/workspace")
  await expect(page).toHaveURL(/\/login\?returnTo=%2Fsettings%2Fworkspace$/)
})

test("cancelling at the identity provider explains what happened", async ({
  page,
}) => {
  await page.goto("/login")
  await page.getByRole("link", { name: "Continue with Google" }).click()
  await page.getByRole("button", { name: "Cancel" }).click()
  await expect(page).toHaveURL(/\/login\?error=denied$/)
  await expect(page.getByRole("alert")).toHaveText("Sign-in was cancelled.")
})
