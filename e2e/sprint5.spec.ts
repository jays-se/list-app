import { type Browser, expect, test } from "@playwright/test"
import {
  choose,
  collectErrors,
  createWorkspace,
  expectNoAxeViolations,
  forbidMainThreadNetwork,
  signIn,
  uniquePerson,
} from "./helpers.ts"

async function person(browser: Browser, first: string) {
  const page = await (await browser.newContext()).newPage()
  await forbidMainThreadNetwork(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const who = uniquePerson(first)
  await signIn(page, who)
  return { page, who }
}

test("quick capture → dashboard → calendar", async ({ browser }) => {
  const { page } = await person(browser, "Quinn")
  await createWorkspace(page, "Capture co")
  const errors = collectErrors(page)

  await page.getByRole("link", { name: "Capture" }).click()
  await page
    .getByRole("textbox", { name: "Notes" })
    .fill("- Call the vendor\n\n2) Send the deck\n• Book a room")
  await choose(page, "Source", "Personal")
  await page.getByRole("button", { name: "Preview tasks" }).click()
  await expect(page.getByText("3 tasks · 1 empty line skipped")).toBeVisible()
  await page.getByRole("textbox", { name: "Task 3" }).fill("Book the big room")
  await page.getByRole("button", { name: "Remove task 2" }).click()
  await expectNoAxeViolations(page, "capture preview")
  await page.getByRole("button", { name: "Create 2 tasks" }).click()
  await expect(page.getByRole("status")).toContainText("Created 2 tasks.")

  // Personal tasks are assigned to me → the dashboard counts them.
  await page.getByRole("link", { name: "Home" }).click()
  const summary = page.getByRole("list", { name: "Summary" })
  await expect(
    summary.getByRole("link", { name: /My open tasks/ })
  ).toContainText("2")
  await expect(page.getByRole("region", { name: "By status" })).toContainText(
    "2 tasks"
  )
  await expectNoAxeViolations(page, "dashboard")

  // Calendar: captured tasks have no due date → listed beside the grid.
  await page.getByRole("link", { name: "Calendar" }).click()
  await expect(page.getByRole("table")).toBeVisible()
  const undated = page.getByRole("list", { name: "Tasks without a due date" })
  await expect(undated).toContainText("Call the vendor")
  await expect(undated).toContainText("Book the big room")
  await page.getByRole("button", { name: "Next month" }).click()
  await expect(page).toHaveURL(/month=\d{4}-\d{2}/)
  await expectNoAxeViolations(page, "calendar")
  await undated.getByRole("link", { name: /Call the vendor/ }).click()
  await expect(
    page.getByRole("dialog", { name: "Call the vendor" })
  ).toBeVisible()
  expect(errors).toEqual([])
})

test("owner promotes, removes; member leaves; last owner is protected", async ({
  browser,
}) => {
  const owner = await person(browser, "Olive")
  await createWorkspace(owner.page, "Crew")
  await owner.page.getByRole("link", { name: "Settings" }).click()
  const code =
    (await owner.page.getByTestId("invite-code").textContent())?.trim() ?? ""
  const joiners = []
  for (const first of ["Mia", "Ned"]) {
    const p = await person(browser, first)
    await p.page.getByRole("textbox", { name: /Invite code/ }).fill(code)
    await p.page.getByRole("button", { name: "Join workspace" }).click()
    await expect(p.page.getByRole("main")).toContainText("You're in Crew")
    joiners.push(p)
  }
  const [mia, ned] = joiners as [(typeof joiners)[0], (typeof joiners)[0]]
  const o = owner.page
  const errors = collectErrors(o)
  await o.reload()

  // The only owner can't leave.
  await o.getByRole("button", { name: "Leave Crew" }).click()
  await o
    .getByRole("alertdialog", { name: "Leave Crew?" })
    .getByRole("button", { name: "Leave" })
    .click()
  await expect(
    o.getByText("You're the only owner. Make someone else an owner first.")
  ).toBeVisible()

  // Promote Mia; remove Ned (then offered a new invite code).
  await choose(o, `Role for ${mia.who.name}`, "Owner")
  await o.getByRole("button", { name: `Remove ${ned.who.name}` }).click()
  await o
    .getByRole("alertdialog", { name: `Remove ${ned.who.name} from Crew?` })
    .getByRole("button", { name: "Remove" })
    .click()
  await expect(o.getByRole("status")).toContainText(`Removed ${ned.who.name}`)
  await expectNoAxeViolations(o, "settings after removal")
  await o
    .getByRole("status")
    .getByRole("button", { name: "Generate new code" })
    .click()
  await expect(o.getByRole("status")).toHaveCount(0)

  // Ned's next navigation lands on onboarding (he has no other workspace).
  await ned.page.getByRole("link", { name: "Tasks", exact: true }).click()
  await expect(ned.page).toHaveURL(/\/onboarding/)

  // Mia (now an owner) can leave because Olive is still an owner.
  await mia.page.reload()
  await mia.page.getByRole("link", { name: "Settings" }).click()
  await mia.page.getByRole("button", { name: "Leave Crew" }).click()
  await mia.page
    .getByRole("alertdialog", { name: "Leave Crew?" })
    .getByRole("button", { name: "Leave" })
    .click()
  await expect(mia.page).toHaveURL(/\/onboarding/)
  expect(errors).toEqual([])
})
