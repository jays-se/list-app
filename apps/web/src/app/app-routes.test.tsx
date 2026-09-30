import { Bridge, BridgeProvider } from "@app/bridge"
import { createInlineBackend, createKernel } from "@app/worker"
import { act, fireEvent, render, screen, within } from "@testing-library/react"
import { createMemoryRouter, RouterProvider } from "react-router"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createAppRoutes } from "./router.tsx"

type Ws = { id: string; name: string; role: "OWNER" | "MEMBER" }

/** In-memory API: just enough of api/openapi.yaml for the session flows. */
function fakeApi(initial: {
  signedIn: boolean
  workspaces?: Ws[]
  active?: string
}) {
  const state = {
    signedIn: initial.signedIn,
    workspaces: initial.workspaces ?? [],
    active: initial.active ?? null,
  }
  const calls: string[] = []
  const json = (body: unknown, status = 200) => Response.json(body, { status })
  const problem = (status: number, detail: string) =>
    json({ type: "x", title: "x", status, detail }, status)
  const handler = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = String(input).replace("/api/v1", "")
    const method = init?.method ?? "GET"
    calls.push(`${method} ${path}`)
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (!state.signedIn) return problem(401, "sign in required")
    const active = state.workspaces.find((w) => w.id === state.active)
    switch (`${method} ${path}`) {
      case "GET /auth/me":
        return json({
          user: {
            id: "u1",
            name: "Ada Lovelace",
            email: "ada@x.io",
            image: null,
          },
        })
      case "GET /workspaces":
        return json({
          workspaces: state.workspaces,
          active: active ? { ...active, inviteCode: "invite-123" } : null,
        })
      case "POST /workspaces": {
        const ws: Ws = {
          id: `w${state.workspaces.length + 1}`,
          name: body.name,
          role: "OWNER",
        }
        state.workspaces.push(ws)
        state.active = ws.id
        return json({ workspace: ws }, 201)
      }
      case "POST /workspaces/join":
        return problem(404, "That invite code isn't valid.")
      case "POST /workspaces/switch":
        state.active = body.workspaceId
        return json({
          workspace: state.workspaces.find((w) => w.id === body.workspaceId),
        })
      case "GET /workspaces/current/members":
        return json({
          members: [
            {
              id: "u1",
              name: "Ada Lovelace",
              email: "ada@x.io",
              image: null,
              role: "OWNER",
              joinedAt: "2026-09-30T10:00:00Z",
            },
          ],
        })
      case "GET /system/info":
        return json({
          service: "list-api",
          version: "test",
          startedAt: "2026-09-30T10:00:00Z",
        })
      default:
        return problem(404, `no fake for ${method} ${path}`)
    }
  })
  return { handler, state, calls }
}

const bridges: Bridge[] = []
afterEach(() => {
  for (const b of bridges.splice(0)) b.dispose()
})

function renderApp(path: string, api: ReturnType<typeof fakeApi>) {
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

describe("session guard", () => {
  it("sends signed-out users to /login with returnTo", async () => {
    const router = renderApp(
      "/settings/workspace",
      fakeApi({ signedIn: false })
    )
    const cta = await screen.findByRole("link", {
      name: "Continue with Google",
    })
    expect(router.state.location.pathname).toBe("/login")
    expect(router.state.location.search).toBe(
      "?returnTo=%2Fsettings%2Fworkspace"
    )
    expect(cta.getAttribute("href")).toBe(
      "/api/v1/auth/google/login?returnTo=%2Fsettings%2Fworkspace"
    )
  })

  it("shows the reason when sign-in failed", async () => {
    renderApp("/login?error=denied", fakeApi({ signedIn: false }))
    expect((await screen.findByRole("alert")).textContent).toBe(
      "Sign-in was cancelled."
    )
  })

  it("never forwards an off-site returnTo", async () => {
    renderApp("/login?returnTo=//evil.example", fakeApi({ signedIn: false }))
    const cta = await screen.findByRole("link", {
      name: "Continue with Google",
    })
    expect(cta.getAttribute("href")).toBe(
      "/api/v1/auth/google/login?returnTo=%2F"
    )
  })
})

describe("onboarding", () => {
  it("validates in the worker, then creates the workspace and lands home", async () => {
    const api = fakeApi({ signedIn: true })
    const router = renderApp("/", api)
    await screen.findByRole("heading", { name: "Welcome, Ada" })
    expect(router.state.location.pathname).toBe("/onboarding")

    const create = screen.getByRole("button", { name: "Create workspace" })
    fireEvent.click(create)
    expect(await screen.findByText("Workspace name is required")).toBeTruthy()
    expect(api.calls).not.toContain("POST /workspaces")

    fireEvent.change(screen.getByRole("textbox", { name: /Workspace name/ }), {
      target: { value: "Acme" },
    })
    fireEvent.click(create)
    expect(
      await screen.findByRole("heading", {
        name: /^(Good (morning|afternoon|evening)|Welcome), Ada$/,
      })
    ).toBeTruthy()
    expect(await screen.findByText("Acme", { selector: "strong" })).toBeTruthy()
    expect(router.state.location.pathname).toBe("/")
  })

  it("shows the server's message for a bad invite code", async () => {
    renderApp("/onboarding", fakeApi({ signedIn: true }))
    fireEvent.change(
      await screen.findByRole("textbox", { name: /Invite code/ }),
      {
        target: { value: "nope" },
      }
    )
    fireEvent.click(screen.getByRole("button", { name: "Join workspace" }))
    expect(
      await screen.findByText("That invite code isn't valid.")
    ).toBeTruthy()
  })
})

describe("signed in with a workspace", () => {
  const ready = () =>
    fakeApi({
      signedIn: true,
      workspaces: [
        { id: "w1", name: "Acme", role: "OWNER" },
        { id: "w2", name: "Beta", role: "MEMBER" },
      ],
      active: "w1",
    })

  it("settings shows the invite code, owner controls and members", async () => {
    renderApp("/settings/workspace", ready())
    expect((await screen.findByTestId("invite-code")).textContent).toBe(
      "invite-123"
    )
    expect(
      screen.getByRole("button", { name: "Generate new code" })
    ).toBeTruthy()
    const list = (await screen.findByText("(you)")).closest("ul") as HTMLElement
    expect(within(list).getByText("(you)")).toBeTruthy()
    expect(within(list).getByText("Owner")).toBeTruthy()
    expect(screen.getByText("1 member")).toBeTruthy()
  })

  it("switching workspace goes through the worker and refreshes the session", async () => {
    const api = ready()
    renderApp("/", api)
    const switcher = await screen.findByRole("combobox", { name: "Workspace" })
    expect(switcher.textContent).toContain("Acme")
    fireEvent.click(switcher)
    await act(async () => {
      fireEvent.click(screen.getByRole("option", { name: /Beta/ }))
    })
    expect(await screen.findByText("Beta", { selector: "strong" })).toBeTruthy()
    expect(api.calls).toContain("POST /workspaces/switch")
  })
})
