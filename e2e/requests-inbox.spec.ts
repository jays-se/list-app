import { type Browser, expect, type Page, test } from "@playwright/test"
import {
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

/** The dispatcher runs every second; reload until the inbox shows `text`. */
async function inboxShows(page: Page, text: RegExp) {
  await expect(async () => {
    await page.goto("/inbox")
    await expect(
      page.getByRole("list", { name: "Notifications" })
    ).toContainText(text, { timeout: 1_000 })
  }).toPass({ timeout: 15_000 })
}

test("assignee requests a change, manager approves, both get notified", async ({
  browser,
}) => {
  const owner = await person(browser, "Olga")
  await createWorkspace(owner.page, "Governance")
  await owner.page.getByRole("link", { name: "Settings" }).click()
  const code =
    (await owner.page.getByTestId("invite-code").textContent())?.trim() ?? ""
  const member = await person(browser, "Max")
  await member.page.getByRole("textbox", { name: /Invite code/ }).fill(code)
  await member.page.getByRole("button", { name: "Join workspace" }).click()
  await expect(member.page.getByRole("main")).toContainText(
    "You're in Governance"
  )
  const errors = collectErrors(owner.page)

  // Olga creates a task and assigns Max.
  const o = owner.page
  await o.getByRole("link", { name: "Tasks", exact: true }).click()
  await o.getByRole("button", { name: "New task" }).click()
  const create = o.getByRole("dialog", { name: "New task" })
  await create
    .getByRole("textbox", { name: "Title", exact: true })
    .fill("Budget review")
  await create.getByRole("checkbox", { name: member.who.name }).check()
  await create.getByRole("button", { name: "Create task" }).click()
  await o
    .getByRole("dialog", { name: "Budget review" })
    .getByRole("button", { name: "Close" })
    .click()

  // Max: ASSIGNED in the inbox → deep link → request mode.
  const m = member.page
  await inboxShows(m, /assigned you/)
  await expect(m.getByRole("link", { name: /Inbox, 1 unread/ })).toBeVisible()
  await expectNoAxeViolations(m, "inbox")
  await m.getByRole("link", { name: "Budget review" }).click()
  const drawer = m.getByRole("dialog", { name: "Budget review" })
  await expect(drawer).toContainText("Changes need approval")
  await drawer
    .getByRole("combobox", { name: "Status" })
    .selectOption({ label: "In progress" })
  await m.getByRole("button", { name: "Request changes" }).click()
  const confirm = m.getByRole("alertdialog", {
    name: "Send your changes for approval?",
  })
  await confirm.getByRole("textbox", { name: "Note" }).fill("Started today")
  await confirm.getByRole("button", { name: "Send request" }).click()
  await expect(drawer).toContainText("Awaiting approval: In progress")
  const requests = drawer.getByRole("list", { name: "Change requests" })
  await expect(requests).toContainText("Change status to In progress")
  await expect(requests).toContainText("Started today")
  await expectNoAxeViolations(m, "task in request mode")

  // Olga: REQUEST in the inbox → approve.
  await inboxShows(o, /requested: Change status to In progress/)
  await o.getByRole("link", { name: "Budget review" }).first().click()
  const review = o.getByRole("dialog", { name: "Budget review" })
  await review
    .getByRole("button", { name: "Approve: Change status to In progress" })
    .click()
  await expect(
    review.getByRole("list", { name: "Change requests" })
  ).toContainText("Approved by Olga Tester")
  await expect(review).toContainText("In progress ·")

  // Max: REVIEWED (and STATUS), then mark all read.
  await inboxShows(m, /approved your request: Change status to In progress/)
  await m.getByRole("button", { name: "Mark all as read" }).click()
  await expect(m.getByText("All caught up")).toBeVisible()
  await m.getByRole("tab", { name: "Unread" }).click()
  await expect(m.getByText("No unread notifications.")).toBeVisible()

  // Settings: turn off status changes.
  const status = m.getByRole("checkbox", { name: /Status changes/ })
  await status.uncheck()
  await m.reload()
  await expect(
    m.getByRole("checkbox", { name: /Status changes/ })
  ).not.toBeChecked()
  expect(errors).toEqual([])
})
