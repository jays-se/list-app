import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { AddIcon } from "../icons/index.tsx"
import { applyTheme, loadTheme, saveTheme } from "../theme/theme.ts"
import { Avatar, initials } from "./Avatar/Avatar.tsx"
import { Badge } from "./Badge/Badge.tsx"
import { Button, IconButton } from "./Button/Button.tsx"
import { Checkbox } from "./Checkbox/Checkbox.tsx"
import { Field } from "./Field/Field.tsx"
import { Input, Textarea } from "./Input/Input.tsx"
import { Spinner } from "./Spinner/Spinner.tsx"

describe("Button", () => {
  it("is a type=button by default and handles clicks", () => {
    const onClick = vi.fn()
    render(<Button onClick={onClick}>Save</Button>)
    const button = screen.getByRole("button", { name: "Save" })
    expect(button.getAttribute("type")).toBe("button")
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it("does not fire when disabled", () => {
    const onClick = vi.fn()
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>
    )
    fireEvent.click(screen.getByRole("button"))
    expect(onClick).not.toHaveBeenCalled()
  })

  it("icon-only buttons are named by aria-label, and icons are hidden from AT", () => {
    render(<IconButton icon={<AddIcon />} aria-label="Add task" />)
    const button = screen.getByRole("button", { name: "Add task" })
    expect(button.querySelector("svg")?.getAttribute("aria-hidden")).toBe(
      "true"
    )
  })
})

describe("Field", () => {
  it("labels its control and wires hint + validation message", () => {
    render(
      <Field
        label="Title"
        hint="Keep it short"
        validationMessage="Title is required"
        required
      >
        <Input />
      </Field>
    )
    const input = screen.getByRole("textbox", { name: /Title/ })
    expect(input.getAttribute("aria-invalid")).toBe("true")
    expect(input.hasAttribute("required")).toBe(true)
    const describedBy = input.getAttribute("aria-describedby")?.split(" ") ?? []
    const texts = describedBy.map(
      (id) => document.getElementById(id)?.textContent
    )
    expect(texts).toEqual(["Title is required", "Keep it short"])
    expect(screen.getByRole("alert").textContent).toBe("Title is required")
  })

  it("works with a textarea and no validation", () => {
    render(
      <Field label="Notes">
        <Textarea />
      </Field>
    )
    const box = screen.getByRole("textbox", { name: "Notes" })
    expect(box.tagName).toBe("TEXTAREA")
    expect(box.hasAttribute("aria-invalid")).toBe(false)
  })
})

describe("Checkbox", () => {
  it("toggles through its label", () => {
    render(<Checkbox label="Done" />)
    const box = screen.getByRole("checkbox", {
      name: "Done",
    }) as HTMLInputElement
    fireEvent.click(screen.getByText("Done"))
    expect(box.checked).toBe(true)
  })
})

describe("Spinner, Badge, Avatar", () => {
  it("spinner exposes a progressbar with a name", () => {
    render(<Spinner />)
    expect(screen.getByRole("progressbar", { name: "Loading" })).toBeTruthy()
  })

  it("badge renders its content", () => {
    render(<Badge color="danger">Overdue</Badge>)
    expect(screen.getByText("Overdue")).toBeTruthy()
  })

  it("avatar is named and shows initials", () => {
    render(<Avatar name="Ada Lovelace" />)
    expect(screen.getByRole("img", { name: "Ada Lovelace" }).textContent).toBe(
      "AL"
    )
  })

  it.each([
    ["Ada Lovelace", "AL"],
    ["  grace  ", "G"],
    ["Jean Claude Van Damme", "JD"],
    ["", ""],
  ])("initials(%j) = %j", (name, expected) => {
    expect(initials(name)).toBe(expected)
  })
})

describe("theme", () => {
  it("sets and clears data-theme on the root", () => {
    const root = document.createElement("html")
    applyTheme("dark", root)
    expect(root.dataset.theme).toBe("dark")
    applyTheme("system", root)
    expect(root.dataset.theme).toBeUndefined()
  })

  it("persists the preference and ignores junk", () => {
    saveTheme("hc")
    expect(loadTheme()).toBe("hc")
    localStorage.setItem("app.theme", "purple")
    expect(loadTheme()).toBe("system")
  })
})
