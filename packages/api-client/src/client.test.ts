import { describe, expect, it, vi } from "vitest"
import { AppError, createApiClient } from "./index.ts"

function fakeFetch(response: Response) {
  return vi.fn<typeof fetch>(async () => response)
}

describe("createApiClient", () => {
  it("sends cookie credentials, CSRF header and JSON body", async () => {
    const fetch = fakeFetch(Response.json({ id: "t1" }))
    const api = createApiClient({ fetch })
    const result = await api.post<{ id: string }>("/tasks", { title: "A" })
    expect(result).toEqual({ id: "t1" })
    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe("/api/v1/tasks")
    expect(init?.credentials).toBe("include")
    expect(init?.headers).toMatchObject({
      "X-Requested-With": "app",
      "Content-Type": "application/json",
    })
    expect(init?.body).toBe('{"title":"A"}')
  })

  it("returns undefined for 204", async () => {
    const api = createApiClient({
      fetch: fakeFetch(new Response(null, { status: 204 })),
    })
    await expect(api.delete("/tasks/1")).resolves.toBeUndefined()
  })

  it("maps problem+json to AppError with field errors", async () => {
    const body = {
      type: "validation",
      title: "Invalid",
      status: 422,
      detail: "Title is required",
      errors: [{ field: "title", message: "Title is required" }],
    }
    const api = createApiClient({
      fetch: fakeFetch(
        new Response(JSON.stringify(body), {
          status: 422,
          headers: { "Content-Type": "application/problem+json" },
        })
      ),
    })
    const error = await api.post("/tasks", {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(AppError)
    const appError = error as AppError
    expect(appError.status).toBe(422)
    expect(appError.message).toBe("Title is required")
    expect(appError.toProtocolError()).toEqual({
      code: "HTTP_422",
      message: "Title is required",
      status: 422,
      fieldErrors: [{ field: "title", message: "Title is required" }],
    })
  })

  it("falls back to statusText for non-JSON errors", async () => {
    const api = createApiClient({
      fetch: fakeFetch(
        new Response("<html>bad gateway</html>", {
          status: 502,
          statusText: "Bad Gateway",
        })
      ),
    })
    const error = (await api.get("/x").catch((e: unknown) => e)) as AppError
    expect(error.title).toBe("Bad Gateway")
    expect(error.message).toBe("Bad Gateway")
  })

  it("reports 401 through onUnauthorized", async () => {
    const onUnauthorized = vi.fn()
    const api = createApiClient({
      fetch: fakeFetch(
        Response.json({ title: "Unauthorized" }, { status: 401 })
      ),
      onUnauthorized,
    })
    await expect(api.get("/auth/me")).rejects.toBeInstanceOf(AppError)
    expect(onUnauthorized).toHaveBeenCalledOnce()
  })
})
