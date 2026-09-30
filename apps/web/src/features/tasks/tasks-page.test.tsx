import { Bridge, BridgeProvider } from "@app/bridge"
import { createInlineBackend, createKernel } from "@app/worker"
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAppRoutes } from "../../app/router.tsx"

type Person = { id: string; name: string; image: null }
const ada: Person = { id: "u1", name: "Ada Lovelace", image: null }
const grace: Person = { id: "u2", name: "Grace Hopper", image: null }

function makeTask(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    title: "Ship v1",
    description: null,
    status: "TODO",
    priority: "HIGH",
    startDate: "2026-10-01",
    endDate: "2026-10-03",
    dueDate: null,
    assignees: [grace],
    owners: [],
    labels: [{ id: "l1", name: "Bug", color: "red" }],
    createdBy: ada,
    createdAt: "2026-09-30T10:00:00Z",
    updatedAt: "2026-09-30T10:00:00Z",
    version: 1,
    viewer: {
      canManage: true,
      canManageOwners: true,
      isAssignee: false,
      canRequest: false,
    },
    client: null,
    parent: null,
    subtasks: [],
    checklist: [],
    comments: [],
    attachments: [],
    requests: [],
    ...over,
  }
}

function fakeApi(opts: { canManage?: boolean } = {}) {
  let task = makeTask(
    opts.canManage === false
      ? {
          viewer: {
            canManage: false,
            canManageOwners: false,
            isAssignee: true,
            canRequest: false,
          },
        }
      : {}
  )
  const calls: string[] = []
  const json = (b: unknown, status = 200) => Response.json(b, { status })
  const handler = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const url = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    calls.push(`${method} ${url}`)
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    const [path] = url.split("?")
    switch (`${method} ${path}`) {
      case "GET /auth/me":
        return json({ user: { ...ada, email: "ada@x.io" } })
      case "GET /workspaces":
        return json({
          workspaces: [{ id: "w1", name: "Acme", role: "OWNER" }],
          active: { id: "w1", name: "Acme", role: "OWNER", inviteCode: "c" },
        })
      case "GET /workspaces/current/members":
        return json({
          members: [
            {
              ...ada,
              email: "a@x",
              role: "OWNER",
              joinedAt: "2026-09-01T00:00:00Z",
            },
            {
              ...grace,
              email: "g@x",
              role: "MEMBER",
              joinedAt: "2026-09-02T00:00:00Z",
            },
          ],
        })
      case "GET /clients":
        return json({ clients: [] })
      case "GET /labels":
        return json({ labels: [{ id: "l1", name: "Bug", color: "red" }] })
      case "GET /tasks": {
        const {
          owners: _o,
          description: _d,
          createdAt: _c,
          subtasks: _s,
          checklist: _k,
          comments: _m,
          attachments: _a,
          requests: _r,
          ...rest
        } = task
        const counts = {
          subtasks: 0,
          subtasksDone: 0,
          checklist: 0,
          checklistDone: 0,
          comments: 0,
          attachments: 0,
          pendingRequests: 0,
        }
        return json({
          tasks: url.includes("status=DONE")
            ? []
            : [{ ...rest, counts, source: null }],
        })
      }
      case "GET /tasks/t1":
        return json({ task })
      case "PATCH /tasks/t1":
        task = { ...task, ...body, version: task.version + 1 }
        return json({ task })
      case "POST /tasks":
        return json({ task: makeTask({ id: "t2", title: body.title }) }, 201)
      default:
        return json(
          {
            type: "x",
            title: "x",
            status: 404,
            detail: `no fake ${method} ${url}`,
          },
          404
        )
    }
  })
  return { handler, calls }
}

const bridges: Bridge[] = []
afterEach(() => {
  for (const b of bridges.splice(0)) b.dispose()
})

function renderAt(path: string, api: ReturnType<typeof fakeApi>) {
  const bridge = new Bridge(
    createInlineBackend((post) =>
      createKernel({ post, fetch: api.handler, locale: "en-GB" })
    )
  )
  bridges.push(bridge)
  const router = createMemoryRouter(createAppRoutes(bridge), {
    initialEntries: [path],
  })
  render(
    <BridgeProvider bridge={bridge}>
      <RouterProvider router={router} />
    </BridgeProvider>
  )
  return router
}

describe("tasks page", () => {
  it("lists tasks grouped by status and filters through the URL", async () => {
    const api = fakeApi()
    const router = renderAt("/tasks", api)
    const group = await screen.findByRole("region", { name: /To do/ })
    const row = within(group).getByRole("link", { name: /Ship v1/ })
    expect(row.textContent).toContain("High")
    expect(row.textContent).toContain("Bug")
    expect(row.textContent).toContain("Assignees: Grace")

    fireEvent.change(screen.getByRole("combobox", { name: "Status" }), {
      target: { value: "DONE" },
    })
    expect(await screen.findByText("No matching tasks")).toBeTruthy()
    expect(router.state.location.search).toBe("?status=DONE")
    expect(api.calls).toContain("GET /tasks?status=DONE")

    fireEvent.click(screen.getByRole("button", { name: "Clear filters" }))
    expect(await screen.findByRole("link", { name: /Ship v1/ })).toBeTruthy()
  })

  it("opens a task, saves only the changed field, and guards unsaved changes", async () => {
    const api = fakeApi()
    const router = renderAt("/tasks", api)
    fireEvent.click(await screen.findByRole("link", { name: /Ship v1/ }))
    const drawer = await screen.findByRole("dialog", { name: "Ship v1" })
    expect(router.state.location.search).toBe("?task=t1")

    const title = within(drawer).getByRole("textbox", { name: /Title/ })
    fireEvent.change(title, { target: { value: "Ship v1.1" } })

    // Closing with unsaved changes asks first.
    fireEvent.click(within(drawer).getByRole("button", { name: "Close" }))
    const confirm = await screen.findByRole("alertdialog", {
      name: "Discard your unsaved changes to this task?",
    })
    fireEvent.click(
      within(confirm).getByRole("button", { name: "Keep editing" })
    )

    fireEvent.click(
      within(drawer).getByRole("button", { name: "Save changes" })
    )
    await waitFor(() => expect(api.calls).toContain("PATCH /tasks/t1"))
    const patch = api.handler.mock.calls.find(
      ([, init]) => init?.method === "PATCH"
    )
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ title: "Ship v1.1" })
    expect(new Headers(patch?.[1]?.headers).get("If-Match")).toBe('"1"')
    expect(
      await screen.findByRole("dialog", { name: "Ship v1.1" })
    ).toBeTruthy()
  })

  it("is read-only for people who can't manage the task", async () => {
    renderAt("/tasks?task=t1", fakeApi({ canManage: false }))
    const drawer = await screen.findByRole("dialog", { name: "Ship v1" })
    expect(
      within(drawer).getByText(
        "You can view this task. Its creator and owners can change it."
      )
    ).toBeTruthy()
    expect(
      within(drawer).queryByRole("button", { name: "Save changes" })
    ).toBeNull()
    expect(within(drawer).queryByRole("textbox", { name: /Title/ })).toBeNull()
    // Anyone in the workspace can still comment.
    expect(
      within(drawer).getByRole("textbox", { name: "Add a comment" })
    ).toBeTruthy()
  })

  it("validates a new task in the worker before sending", async () => {
    const api = fakeApi()
    renderAt("/tasks?create=1", api)
    const drawer = await screen.findByRole("dialog", { name: "New task" })
    fireEvent.click(within(drawer).getByRole("button", { name: "Create task" }))
    expect(await within(drawer).findByText("Title is required")).toBeTruthy()
    expect(api.calls).not.toContain("POST /tasks")

    fireEvent.change(within(drawer).getByRole("textbox", { name: /Title/ }), {
      target: { value: "Write docs" },
    })
    fireEvent.click(
      within(drawer).getByRole("checkbox", { name: /Grace Hopper/ })
    )
    fireEvent.click(within(drawer).getByRole("button", { name: "Create task" }))
    await waitFor(() => expect(api.calls).toContain("POST /tasks"))
    const post = api.handler.mock.calls.find(
      ([, init]) => init?.method === "POST"
    )
    expect(JSON.parse(String(post?.[1]?.body))).toMatchObject({
      title: "Write docs",
      assigneeIds: ["u2"],
      status: "TODO",
    })
  })
})
