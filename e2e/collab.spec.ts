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

async function openNewTask(page: Page, title: string, client?: string) {
  await page.getByRole("link", { name: "Tasks", exact: true }).click()
  await page.getByRole("button", { name: "New task" }).click()
  const d = page.getByRole("dialog", { name: "New task" })
  await d.getByRole("textbox", { name: "Title", exact: true }).fill(title)
  if (client)
    await d
      .getByRole("combobox", { name: "Client" })
      .selectOption({ label: client })
  await d.getByRole("button", { name: "Create task" }).click()
  const drawer = page.getByRole("dialog", { name: title })
  await expect(drawer).toBeVisible()
  return drawer
}

test("clients: create, link a task, delete unlinks", async ({ browser }) => {
  const { page } = await person(browser, "Cleo")
  await createWorkspace(page, "Agency")
  const errors = collectErrors(page)

  await page.getByRole("link", { name: "Clients" }).click()
  await page.getByRole("button", { name: "Add client" }).click()
  await expect(page.getByText("Client name is required")).toBeVisible()
  await page.getByRole("textbox", { name: "Name" }).fill("Globex")
  await page.getByRole("textbox", { name: "Email" }).fill("ops@globex.test")
  await page.getByRole("button", { name: "Add client" }).click()
  await expect(page).toHaveURL(/\/clients\/[0-9a-f-]{36}$/)
  await expectNoAxeViolations(page, "client detail")

  const drawer = await openNewTask(page, "Globex kickoff", "Globex")
  await drawer.getByRole("button", { name: "Close" }).click()
  await expect(
    page.getByRole("link", { name: /Globex kickoff/ })
  ).toContainText("Globex")

  await page.getByRole("link", { name: "Clients" }).click()
  await expect(page.getByRole("link", { name: /Globex/ })).toContainText(
    "1 task"
  )
  await page.getByRole("link", { name: /Globex/ }).click()
  await expect(page.getByRole("link", { name: "Globex kickoff" })).toBeVisible()
  await page.getByRole("button", { name: "Delete client" }).click()
  await page
    .getByRole("alertdialog", { name: "Delete Globex?" })
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page).toHaveURL(/\/clients$/)
  await page.getByRole("link", { name: "Tasks", exact: true }).click()
  const row = page.getByRole("link", { name: /Globex kickoff/ })
  await expect(row).toBeVisible()
  await expect(row.getByText("Globex", { exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})

test("subtasks, checklist, comments with mentions, attachments, activity", async ({
  browser,
}) => {
  const owner = await person(browser, "Olga")
  await createWorkspace(owner.page, "Collab")
  await owner.page.getByRole("link", { name: "Settings" }).click()
  const code =
    (await owner.page.getByTestId("invite-code").textContent())?.trim() ?? ""
  const member = await person(browser, "Max")
  await member.page.getByRole("textbox", { name: /Invite code/ }).fill(code)
  await member.page.getByRole("button", { name: "Join workspace" }).click()
  await expect(member.page.getByRole("main")).toContainText("You're in Collab")

  const page = owner.page
  const errors = collectErrors(page)
  const drawer = await openNewTask(page, "Launch site")

  // Subtask.
  await drawer.getByRole("textbox", { name: "New subtask" }).fill("Write copy")
  await drawer.getByRole("button", { name: "Add subtask" }).click()
  await expect(drawer.getByRole("link", { name: "Write copy" })).toBeVisible()
  await expect(drawer.getByText("0 of 1 done")).toBeVisible()

  // Checklist: add then toggle (optimistic).
  await drawer
    .getByRole("textbox", { name: "New checklist item" })
    .fill("Buy domain")
  await drawer.getByRole("button", { name: "Add item" }).click()
  await drawer.getByRole("checkbox", { name: "Buy domain" }).check()
  await expect(drawer.getByText("1 of 1 done")).toBeVisible()

  // Attachments: real bytes to the worker → presigned PUT → complete.
  const chooser = page.waitForEvent("filechooser")
  await drawer.getByRole("button", { name: "Attach files" }).click()
  await (await chooser).setFiles([
    {
      name: "brief.txt",
      mimeType: "text/plain",
      buffer: Buffer.from("launch brief"),
    },
    {
      name: "huge.bin",
      mimeType: "application/octet-stream",
      buffer: Buffer.alloc(5 * 1024 * 1024 + 1),
    },
  ])
  await expect(drawer.getByRole("link", { name: "brief.txt" })).toBeVisible()
  await expect(
    drawer.getByRole("alert").filter({ hasText: "huge.bin is larger than 5MB" })
  ).toBeVisible()
  const download = page.waitForEvent("download")
  await drawer.getByRole("link", { name: "brief.txt" }).click()
  expect((await download).suggestedFilename()).toBe("brief.txt")

  await expectNoAxeViolations(page, "task drawer with sections")

  // The member comments and mentions the owner.
  await member.page.getByRole("link", { name: "Tasks", exact: true }).click()
  await member.page.getByRole("link", { name: /^Launch site/ }).click()
  const memberDrawer = member.page.getByRole("dialog", { name: "Launch site" })
  await memberDrawer
    .getByRole("textbox", { name: "Add a comment" })
    .fill("Looks good,")
  await memberDrawer
    .getByRole("combobox", { name: "Mention someone" })
    .selectOption({ label: owner.who.name })
  await memberDrawer.getByRole("button", { name: "Comment" }).click()
  await expect(
    memberDrawer.locator("mark", { hasText: `@${owner.who.name}` })
  ).toBeVisible()

  // Activity tab, on the owner's side (polls every 10 s; reopen for freshness).
  await drawer.getByRole("button", { name: "Close" }).click()
  await page.getByRole("link", { name: /^Launch site/ }).click()
  await page.getByRole("tab", { name: "Activity" }).click()
  const panel = page.getByRole("tabpanel")
  await expect(panel).toContainText("created this task")
  await expect(panel).toContainText("added subtask “Write copy”")
  await expect(panel).toContainText("completed “Buy domain”")
  await expect(panel).toContainText("attached brief.txt")
  await expect(panel).toContainText(`${member.who.name} commented`)
  await expect(panel).toContainText("To do")
  await expectNoAxeViolations(page, "activity tab")

  // List row shows progress.
  await page
    .getByRole("dialog", { name: "Launch site" })
    .getByRole("button", { name: "Close" })
    .click()
  await expect(page.getByRole("link", { name: /^Launch site/ })).toContainText(
    "0/1 subtasks · 1/1 checklist"
  )
  await expect(page.getByRole("link", { name: /Write copy/ })).toContainText(
    "Subtask of Launch site"
  )
  expect(errors).toEqual([])
})
