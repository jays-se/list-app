import { type Browser, expect, type Page, test } from "@playwright/test"
import {
  collectErrors,
  createWorkspace,
  expectNoAxeViolations,
  forbidMainThreadNetwork,
  signIn,
  uniquePerson,
} from "./helpers.ts"

async function newPerson(browser: Browser, first: string) {
  const page = await (await browser.newContext()).newPage()
  await forbidMainThreadNetwork(page)
  await page.emulateMedia({ reducedMotion: "reduce" })
  const person = uniquePerson(first)
  await signIn(page, person)
  return { page, person }
}

/** Owner creates a workspace; a member joins it. */
async function team(browser: Browser) {
  const owner = await newPerson(browser, "Olivia")
  await createWorkspace(owner.page, "Tasks team")
  await owner.page.getByRole("link", { name: "Settings" }).click()
  const code =
    (await owner.page.getByTestId("invite-code").textContent())?.trim() ?? ""
  const member = await newPerson(browser, "Milo")
  await member.page.getByRole("textbox", { name: /Invite code/ }).fill(code)
  await member.page.getByRole("button", { name: "Join workspace" }).click()
  await expect(member.page.getByRole("main")).toContainText(
    "You're in Tasks team"
  )
  return { owner, member }
}

async function createTask(
  page: Page,
  title: string,
  opts: { assignee?: string; label?: string } = {}
) {
  await page.getByRole("link", { name: "Tasks" }).click()
  await page.getByRole("button", { name: "New task" }).click()
  const drawer = page.getByRole("dialog", { name: "New task" })
  await drawer.getByRole("textbox", { name: /Title/ }).fill(title)
  if (opts.assignee)
    await drawer
      .getByRole("checkbox", { name: new RegExp(opts.assignee) })
      .check()
  if (opts.label)
    await drawer.getByRole("checkbox", { name: new RegExp(opts.label) }).check()
  await drawer.getByRole("button", { name: "Create task" }).click()
  await expect(page.getByRole("dialog", { name: title })).toBeVisible()
}

test("create, filter, edit and delete a task", async ({ browser }) => {
  const { owner, member } = await team(browser)
  const page = owner.page
  const errors = collectErrors(page)

  // A label from settings, then a task using it, assigned to the member.
  await page.getByRole("link", { name: "Settings" }).click()
  await page.getByRole("textbox", { name: "New label" }).fill("Bug")
  await page.getByRole("combobox", { name: "Color" }).selectOption("red")
  await page.getByRole("button", { name: "Add label" }).click()
  await expect(
    page.getByRole("region", { name: "Labels" }).getByText("Bug")
  ).toBeVisible()

  await page.getByRole("link", { name: "Tasks" }).click()
  await page.getByRole("button", { name: "New task" }).click()
  const create = page.getByRole("dialog", { name: "New task" })
  await create.getByRole("button", { name: "Create task" }).click()
  await expect(create.getByText("Title is required")).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(page.getByRole("dialog", { name: "New task" })).toHaveCount(0)

  await createTask(page, "Fix login bug", {
    assignee: member.person.name,
    label: "Bug",
  })
  await expectNoAxeViolations(page, "task drawer")
  await page
    .getByRole("dialog", { name: "Fix login bug" })
    .getByRole("button", { name: "Close" })
    .click()

  await expect(
    page
      .getByRole("region", { name: /To do/ })
      .getByRole("link", { name: /Fix login bug/ })
  ).toBeVisible()
  await expectNoAxeViolations(page, "tasks list")

  // Filter by status via the URL-backed filter bar.
  await page.getByRole("combobox", { name: "Status" }).selectOption("DONE")
  await expect(page).toHaveURL(/status=DONE/)
  await expect(page.getByText("No matching tasks")).toBeVisible()
  await page.getByRole("button", { name: "Clear filters" }).click()

  // Edit: move to In progress with a due date.
  await page.getByRole("link", { name: /Fix login bug/ }).click()
  const drawer = page.getByRole("dialog", { name: "Fix login bug" })
  await drawer
    .getByRole("combobox", { name: "Status" })
    .selectOption("IN_PROGRESS")
  await drawer
    .getByRole("textbox", { name: "End", exact: true })
    .fill("2099-01-10")
  await drawer
    .getByRole("textbox", { name: "Due", exact: true })
    .fill("2099-01-09")
  await drawer.getByRole("button", { name: "Save changes" }).click()
  await expect(
    drawer.getByRole("button", { name: "Save changes" })
  ).toBeDisabled()
  await drawer.getByRole("button", { name: "Close" }).click()
  await expect(
    page
      .getByRole("region", { name: /In progress/ })
      .getByRole("link", { name: /Fix login bug/ })
  ).toContainText(/Due (9 Jan|Jan 9),? 2099/)

  // The member sees it in "Assigned to me" and can only request changes (E5-S3).
  await member.page.getByRole("link", { name: "Tasks" }).click()
  await member.page.getByRole("checkbox", { name: "Assigned to me" }).check()
  await member.page.getByRole("link", { name: /Fix login bug/ }).click()
  await expect(
    member.page.getByText(/Changes you make go to its creator and owners/)
  ).toBeVisible()
  await expect(
    member.page.getByRole("button", { name: "Save changes" })
  ).toHaveCount(0)
  await expect(
    member.page.getByRole("button", { name: "Request changes" })
  ).toBeDisabled()

  // Delete with confirmation.
  await page.getByRole("link", { name: /Fix login bug/ }).click()
  await drawer.getByRole("button", { name: "Delete task" }).click()
  await page
    .getByRole("alertdialog", { name: "Delete this task?" })
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page.getByText("No tasks yet")).toBeVisible()
  expect(errors).toEqual([])
})

test("owners can edit; a stale save gets a conflict and can reload", async ({
  browser,
}) => {
  const { owner, member } = await team(browser)
  await createTask(owner.page, "Plan launch")
  const ownerDrawer = owner.page.getByRole("dialog", { name: "Plan launch" })
  await ownerDrawer
    .getByRole("checkbox", { name: new RegExp(member.person.name) })
    .nth(1)
    .check()
  await ownerDrawer.getByRole("button", { name: "Save changes" }).click()
  await expect(
    ownerDrawer.getByRole("button", { name: "Save changes" })
  ).toBeDisabled()

  // Member is now an owner: edit form, but no owners picker.
  await member.page.getByRole("link", { name: "Tasks" }).click()
  await member.page.getByRole("link", { name: /Plan launch/ }).click()
  const memberDrawer = member.page.getByRole("dialog", { name: "Plan launch" })
  await expect(
    memberDrawer.getByRole("button", { name: "Save changes" })
  ).toBeVisible()
  await expect(memberDrawer.getByRole("group", { name: "Owners" })).toHaveCount(
    0
  )

  // Both edit from version N; the second save conflicts.
  await ownerDrawer
    .getByRole("textbox", { name: /Title/ })
    .fill("Plan launch v2")
  await memberDrawer
    .getByRole("textbox", { name: /Title/ })
    .fill("Plan launch (member)")
  await ownerDrawer.getByRole("button", { name: "Save changes" }).click()
  await expect(
    owner.page.getByRole("dialog", { name: "Plan launch v2" })
  ).toBeVisible()
  await memberDrawer.getByRole("button", { name: "Save changes" }).click()
  await expect(memberDrawer.getByRole("alert")).toContainText(
    "Someone else changed this task"
  )
  await memberDrawer.getByRole("button", { name: "Reload latest" }).click()
  await expect(
    member.page.getByRole("dialog", { name: "Plan launch v2" })
  ).toBeVisible()
})
