import { AppError, type ProblemDetails } from "./app-error.ts"

export interface RequestOptions {
  signal?: AbortSignal
  headers?: Record<string, string>
  /** A 401 here is expected (the session probe); don't raise session.expired. */
  skipAuthRedirect?: boolean
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>
  post<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  put<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  patch<T>(path: string, body?: unknown, options?: RequestOptions): Promise<T>
  delete<T>(path: string, options?: RequestOptions): Promise<T>
}

export interface ApiClientOptions {
  /** Same-origin API prefix. Default `/api/v1`. */
  baseUrl?: string
  fetch?: typeof fetch
  /** Called on any 401 (the worker turns it into a `session.expired` push). */
  onUnauthorized?: () => void
}

/**
 * The only HTTP client in the app. It runs inside the worker (ADR-0005).
 * Cookie session + CSRF header per ADR-0008.
 */
export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? "/api/v1"
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis)

  async function request<T>(
    method: string,
    path: string,
    body: unknown,
    opts: RequestOptions = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "X-Requested-With": "app",
      ...opts.headers,
    }
    const init: RequestInit = { method, headers, credentials: "include" }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
      init.body = JSON.stringify(body)
    }
    if (opts.signal) init.signal = opts.signal

    const response = await doFetch(`${baseUrl}${path}`, init)
    if (response.status === 401 && !opts.skipAuthRedirect) {
      options.onUnauthorized?.()
    }
    if (!response.ok)
      throw new AppError(response.status, await problem(response))
    if (response.status === 204) return undefined as T
    const text = await response.text()
    return (text ? JSON.parse(text) : undefined) as T
  }

  return {
    get: (path, o) => request("GET", path, undefined, o),
    post: (path, body, o) => request("POST", path, body, o),
    put: (path, body, o) => request("PUT", path, body, o),
    patch: (path, body, o) => request("PATCH", path, body, o),
    delete: (path, o) => request("DELETE", path, undefined, o),
  }
}

async function problem(response: Response): Promise<ProblemDetails> {
  const fallback: ProblemDetails = {
    type: "about:blank",
    title: response.statusText,
    status: response.status,
    detail: "",
  }
  try {
    const parsed: unknown = JSON.parse(await response.text())
    return typeof parsed === "object" && parsed !== null
      ? (parsed as ProblemDetails)
      : fallback
  } catch {
    return fallback
  }
}
