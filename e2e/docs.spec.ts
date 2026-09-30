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

test("write a markdown doc: autosave, safe preview, leave guard, upload", async ({
  page,
}) => {
  await signIn(page, uniquePerson("Dora"))
  await createWorkspace(page, "Docs co")
  const errors = collectErrors(page)

  await page.getByRole("link", { name: "Docs" }).click()
  await expect(page.getByText("No docs yet.")).toBeVisible()
  await page.getByRole("button", { name: "New doc" }).click()
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]{36}$/)

  await page.getByRole("textbox", { name: "Title" }).fill("Launch plan")
  const source = page.getByRole("textbox", { name: "Markdown" })
  await source.fill(
    "# Goals\n\n- **Ship** on time\n- Read [the brief](https://example.com)\n\n<script>alert(1)</script> [bad](javascript:alert(1))"
  )
  const preview = page.getByRole("region", { name: "Preview" })
  await expect(preview.getByRole("heading", { name: "Goals" })).toBeVisible()
  await expect(
    preview.getByRole("link", { name: "the brief" })
  ).toHaveAttribute("href", "https://example.com")
  // Hostile content stays text; the javascript: link isn't a link.
  await expect(preview).toContainText("<script>alert(1)</script>")
  await expect(preview.getByRole("link", { name: "bad" })).toHaveCount(0)
  await expect(page.getByRole("status")).toHaveText("All changes saved")
  await expectNoAxeViolations(page, "doc editor")

  // Leaving right after typing asks first.
  await source.fill("# Goals\n\nchanged")
  await page.getByRole("link", { name: "← All docs" }).click()
  const guard = page.getByRole("alertdialog", { name: "Leave without saving?" })
  await expect(guard).toBeVisible()
  await guard.getByRole("button", { name: "Stay" }).click()
  await expect(page.getByRole("status")).toHaveText("All changes saved")

  // Persisted: a reload shows the saved text.
  await page.reload()
  await expect(page.getByRole("textbox", { name: "Markdown" })).toHaveValue(
    "# Goals\n\nchanged"
  )
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
    "Launch plan"
  )

  // Upload a markdown file as a new doc (wait for the list: the editor has
  // a file input of its own).
  await page.getByRole("link", { name: "← All docs" }).click()
  await expect(page).toHaveURL(/\/docs$/)
  await expect(
    page.getByRole("heading", { name: "Docs", level: 1 })
  ).toBeVisible()
  await page.locator('input[type="file"]').setInputFiles({
    name: "meeting.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("## Minutes\n\n1. Decide"),
  })
  await expect(page).toHaveURL(/\/docs\/[0-9a-f-]{36}$/)
  await expect(page.getByRole("textbox", { name: "Title" })).toHaveValue(
    "meeting"
  )
  await expect(
    page
      .getByRole("region", { name: "Preview" })
      .getByRole("heading", { name: "Minutes" })
  ).toBeVisible()

  await page.getByRole("link", { name: "← All docs" }).click()
  const list = page.getByRole("list", { name: "Docs" })
  await expect(list.getByRole("link")).toHaveCount(2)
  await expect(list).toContainText("Launch plan")
  await expectNoAxeViolations(page, "docs list")

  // Delete from the editor.
  await list.getByRole("link", { name: /meeting/ }).click()
  await page.getByRole("button", { name: "Delete doc" }).click()
  await page
    .getByRole("alertdialog", { name: "Delete “meeting”?" })
    .getByRole("button", { name: "Delete" })
    .click()
  await expect(page).toHaveURL(/\/docs$/)
  await expect(
    page.getByRole("list", { name: "Docs" }).getByRole("link")
  ).toHaveCount(1)
  expect(errors).toEqual([])
})

test("keyboard only: create a task and close the drawer", async ({ page }) => {
  await signIn(page, uniquePerson("Kay"))
  await createWorkspace(page, "Keys")
  await page.goto("/tasks")
  await expect(page.getByRole("button", { name: "New task" })).toBeVisible()

  const focused = () =>
    page.evaluate(() => {
      const el = document.activeElement
      return el ? `${el.tagName}:${el.textContent?.trim() ?? ""}` : ""
    })
  let found = false
  for (let i = 0; i < 40 && !found; i++) {
    await page.keyboard.press("Tab")
    found = (await focused()) === "BUTTON:New task"
  }
  expect(found).toBe(true)
  await page.keyboard.press("Enter")
  const dialog = page.getByRole("dialog", { name: "New task" })
  await expect(dialog).toBeVisible()
  await page.keyboard.type("Typed with the keyboard")
  await expect(
    dialog.getByRole("textbox", { name: "Title", exact: true })
  ).toHaveValue("Typed with the keyboard")
  // Submit with Enter from the title field (form submit).
  await page.keyboard.press("Enter")
  const drawer = page.getByRole("dialog", { name: "Typed with the keyboard" })
  await expect(drawer).toBeVisible()
  await page.keyboard.press("Escape")
  await expect(drawer).toHaveCount(0)
  await expect(
    page.getByRole("link", { name: /Typed with the keyboard/ })
  ).toBeVisible()
})
