import { createApiClient } from "@app/api-client"
import {
  type ActionDefinition,
  actions as appActions,
  views as appViews,
  type DomainContext,
  type SessionDto,
  sessionKeys,
  sessionQuery,
  type ViewDefinition,
} from "@app/domain"
import type { ToMain } from "@app/protocol"
import { QueryClient, type QueryClientConfig } from "@app/query"
import { WorkerKernel } from "./kernel.ts"
import { xhrUpload } from "./xhr-upload.ts"

export interface CreateKernelOptions {
  post: (message: ToMain) => void
  fetch?: typeof fetch
  baseUrl?: string
  locale?: string
  now?: () => number
  query?: QueryClientConfig
  /** Override the uploader (tests). Defaults to XHR. */
  upload?: DomainContext["upload"]
  /** Override the registries (tests). Defaults to the app's views/actions. */
  views?: Readonly<Record<string, ViewDefinition<unknown, unknown>>>
  actions?: Readonly<Record<string, ActionDefinition<unknown, unknown>>>
}

/** Wires API client + query engine + domain registries into a kernel. */
export function createKernel(options: CreateKernelOptions): WorkerKernel {
  const { post } = options
  const client = new QueryClient(options.query)
  const now = options.now ?? Date.now
  let kernel: WorkerKernel | undefined
  const api = createApiClient({
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    // The session view refetches and turns "anonymous"; route guards react.
    onUnauthorized: () => {
      post({ kind: "push", topic: "session.expired", data: {} })
      void client.invalidate(sessionKeys.all)
    },
    // Removed from (or left) the workspace (E3-S6): refetch the session and
    // reset tenant data only if the active workspace actually changed, so
    // repeated 409s can't loop (ADR-0024).
    onNoWorkspace: () => void checkTenant(),
  })
  const activeId = () =>
    client.getQueryData<SessionDto>(sessionKeys.current)?.workspaces?.active
      ?.id ?? null
  async function checkTenant() {
    const before = activeId()
    await client.invalidate(sessionKeys.current)
    try {
      await client.fetchQuery(sessionQuery(api))
    } catch {
      return
    }
    if (activeId() !== before) kernel?.reset()
  }
  kernel = new WorkerKernel({
    views: options.views ?? appViews,
    actions: options.actions ?? appActions,
    post,
    context: {
      api,
      client,
      now,
      upload: options.upload ?? xhrUpload,
      notify: (progress) =>
        post({ kind: "push", topic: "upload.progress", data: progress }),
      locale: options.locale ?? "en",
    },
  })
  return kernel
}
