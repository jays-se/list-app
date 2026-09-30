import { fireEvent, render, screen } from "@testing-library/react"
import { useState } from "react"
import { describe, expect, it, vi } from "vitest"
import { Dropdown, type DropdownOption } from "./Dropdown/Dropdown.tsx"
import { MultiDropdown } from "./Dropdown/MultiDropdown.tsx"
import { matches } from "./Dropdown/use-listbox.ts"
import { Field } from "./Field/Field.tsx"
import { Menu } from "./Menu/Menu.tsx"

const STATUS: DropdownOption[] = [
  { value: "TODO", label: "To do" },
  { value: "DOING", label: "In progress" },
  { value: "DONE", label: "Done", description: "Finished work" },
  { value: "GONE", label: "Gone", disabled: true },
]

function Single(props: { onChange?: (v: string) => void; initial?: string }) {
  const [value, setValue] = useState(props.initial ?? "TODO")
  return (
    <Field label="Status" hint="Where it is">
      <Dropdown
        options={STATUS}
        value={value}
        onChange={(v) => {
          setValue(v)
          props.onChange?.(v)
        }}
      />
    </Field>
  )
}

describe("Dropdown", () => {
  it("is a combobox named by its Field label, showing the current value", () => {
    render(<Single />)
    const box = screen.getByRole("combobox", { name: "Status" })
    expect(box.textContent).toContain("To do")
    expect(box.getAttribute("aria-expanded")).toBe("false")
    expect(box.getAttribute("aria-describedby")).toBeTruthy()
  })

  it("opens on click, selects an option and closes", () => {
    const onChange = vi.fn()
    render(<Single onChange={onChange} />)
    fireEvent.click(screen.getByRole("combobox", { name: "Status" }))
    const list = screen.getByRole("listbox", { name: "Status" })
    expect(list).toBeTruthy()
    expect(
      screen
        .getByRole("option", { name: "To do" })
        .getAttribute("aria-selected")
    ).toBe("true")
    fireEvent.click(screen.getByRole("option", { name: /Done/ }))
    expect(onChange).toHaveBeenCalledWith("DONE")
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(screen.getByRole("combobox").textContent).toContain("Done")
  })

  it("supports the keyboard: arrows skip disabled, Enter picks, Esc closes", () => {
    const onChange = vi.fn()
    render(<Single onChange={onChange} />)
    const box = screen.getByRole("combobox")
    fireEvent.keyDown(box, { key: "ArrowDown" })
    expect(box.getAttribute("aria-expanded")).toBe("true")
    const active = () =>
      document.getElementById(box.getAttribute("aria-activedescendant") ?? "")
    expect(active()?.textContent).toContain("To do")
    fireEvent.keyDown(box, { key: "End" })
    expect(active()?.textContent).toContain("Done")
    fireEvent.keyDown(box, { key: "ArrowDown" }) // "Gone" is disabled
    expect(active()?.textContent).toContain("Done")
    fireEvent.keyDown(box, { key: "Home" })
    fireEvent.keyDown(box, { key: "ArrowDown" })
    fireEvent.keyDown(box, { key: "Enter" })
    expect(onChange).toHaveBeenLastCalledWith("DOING")
    fireEvent.keyDown(box, { key: "ArrowUp" })
    expect(active()?.textContent).toContain("Done")
    fireEvent.keyDown(box, { key: "Escape" })
    expect(box.getAttribute("aria-expanded")).toBe("false")
  })

  it("typeahead jumps to a matching label", () => {
    render(<Single />)
    const box = screen.getByRole("combobox")
    fireEvent.keyDown(box, { key: "i" })
    const id = box.getAttribute("aria-activedescendant") ?? ""
    expect(document.getElementById(id)?.textContent).toContain("In progress")
  })

  it("closes on an outside pointer-down without selecting", () => {
    const onChange = vi.fn()
    render(<Single onChange={onChange} />)
    fireEvent.click(screen.getByRole("combobox"))
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("listbox")).toBeNull()
    expect(onChange).not.toHaveBeenCalled()
  })

  it("shows a filter box for long lists and filters by label", () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      value: `v${i}`,
      label: i === 7 ? "Grace Hopper" : `Person ${i}`,
    }))
    const onChange = vi.fn()
    render(
      <Dropdown
        aria-label="Owner"
        options={many}
        value="v0"
        onChange={onChange}
      />
    )
    fireEvent.click(screen.getByRole("combobox", { name: "Owner" }))
    const filter = screen.getByRole("combobox", { name: "Filter owner" })
    fireEvent.change(filter, { target: { value: "grace" } })
    expect(screen.getAllByRole("option")).toHaveLength(1)
    fireEvent.keyDown(filter, { key: "Enter" })
    expect(onChange).toHaveBeenCalledWith("v7")
    fireEvent.click(screen.getByRole("combobox", { name: "Owner" }))
    fireEvent.change(screen.getByRole("combobox", { name: "Filter owner" }), {
      target: { value: "zzz" },
    })
    expect(screen.getByText("No matches")).toBeTruthy()
  })

  it("matches on label and description", () => {
    expect(matches(STATUS[2] as DropdownOption, "finished")).toBe(true)
    expect(matches(STATUS[2] as DropdownOption, " ")).toBe(true)
    expect(matches(STATUS[0] as DropdownOption, "done")).toBe(false)
  })

  it("shows the placeholder when nothing matches the value", () => {
    render(
      <Dropdown
        aria-label="Pick"
        options={STATUS}
        value={"" as string}
        placeholder="Choose one"
        onChange={() => {}}
      />
    )
    expect(screen.getByRole("combobox").textContent).toContain("Choose one")
  })
})

describe("MultiDropdown", () => {
  function Multi() {
    const [value, setValue] = useState<string[]>([])
    return (
      <MultiDropdown
        aria-label="Assignees"
        options={STATUS}
        value={value}
        onChange={setValue}
        maxShown={1}
      />
    )
  }

  it("toggles options, stays open, and summarises the selection", () => {
    render(<Multi />)
    const box = screen.getByRole("combobox", { name: "Assignees" })
    expect(box.textContent).toContain("None")
    fireEvent.click(box)
    expect(
      screen.getByRole("listbox").getAttribute("aria-multiselectable")
    ).toBe("true")
    fireEvent.click(screen.getByRole("option", { name: /Done/ }))
    fireEvent.click(screen.getByRole("option", { name: "To do" }))
    expect(screen.getByRole("listbox")).toBeTruthy()
    // Options order, not click order; one shown, the rest as +N.
    expect(box.textContent).toContain("To do")
    expect(box.textContent).toContain("+1")
    fireEvent.keyDown(box, { key: "Home" })
    fireEvent.keyDown(box, { key: " " })
    expect(box.textContent).toContain("Done")
    expect(box.textContent).not.toContain("+1")
  })
})

describe("Menu", () => {
  function renderMenu(onSignOut = vi.fn(), onTheme = vi.fn()) {
    render(
      <Menu
        label="Account"
        header={<span>Ada Lovelace</span>}
        trigger={(p) => (
          <button type="button" {...p}>
            Open
          </button>
        )}
        items={[
          { kind: "group", key: "g", label: "Theme" },
          {
            kind: "radio",
            key: "dark",
            label: "Dark",
            checked: true,
            onSelect: onTheme,
          },
          {
            kind: "radio",
            key: "light",
            label: "Light",
            checked: false,
            onSelect: onTheme,
          },
          { kind: "separator", key: "s" },
          { key: "off", label: "Disabled", disabled: true, onSelect: vi.fn() },
          {
            key: "out",
            label: "Sign out",
            hint: "⇧Q",
            danger: true,
            onSelect: onSignOut,
          },
        ]}
      />
    )
    return screen.getByRole("button", { name: "Open" })
  }

  it("opens on click with focus on the first item and runs a selection", () => {
    const onSignOut = vi.fn()
    const button = renderMenu(onSignOut)
    expect(button.getAttribute("aria-haspopup")).toBe("menu")
    fireEvent.click(button)
    expect(screen.getByRole("menu", { name: "Account" })).toBeTruthy()
    expect(screen.getByText("Ada Lovelace")).toBeTruthy()
    expect(document.activeElement?.textContent).toContain("Dark")
    expect(
      screen
        .getByRole("menuitemradio", { name: "Dark" })
        .getAttribute("aria-checked")
    ).toBe("true")
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign out/ }))
    expect(onSignOut).toHaveBeenCalledOnce()
    expect(screen.queryByRole("menu")).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it("moves with arrows (skipping disabled), typeahead, and closes on Esc", () => {
    const onTheme = vi.fn()
    const button = renderMenu(vi.fn(), onTheme)
    fireEvent.keyDown(button, { key: "ArrowUp" })
    const menu = screen.getByRole("menu")
    expect(document.activeElement?.textContent).toContain("Sign out")
    fireEvent.keyDown(menu, { key: "ArrowDown" })
    expect(document.activeElement?.textContent).toContain("Dark")
    fireEvent.keyDown(menu, { key: "End" })
    fireEvent.keyDown(menu, { key: "ArrowUp" })
    expect(document.activeElement?.textContent).toContain("Light")
    fireEvent.keyDown(menu, { key: "Home" })
    fireEvent.keyDown(menu, { key: "l" })
    expect(document.activeElement?.textContent).toContain("Light")
    fireEvent.click(document.activeElement as HTMLElement)
    expect(onTheme).toHaveBeenCalledOnce()
    fireEvent.keyDown(button, { key: "Enter" })
    fireEvent.keyDown(screen.getByRole("menu"), { key: "Escape" })
    expect(screen.queryByRole("menu")).toBeNull()
    fireEvent.click(button)
    fireEvent.click(screen.getByRole("menuitem", { name: "Disabled" }))
    expect(screen.getByRole("menu")).toBeTruthy()
    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole("menu")).toBeNull()
  })
})
