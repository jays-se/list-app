import { createApiClient } from "@app/api-client"
import {
  type ActionDefinition,
  actions as appActions,
  views as appViews,
  type DomainContext,
  sessionKeys,
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
  const api = createApiClient({
    ...(options.baseUrl ? { baseUrl: options.baseUrl } : {}),
    ...(options.fetch ? { fetch: options.fetch } : {}),
    // The session view refetches and turns "anonymous"; route guards react.
    onUnauthorized: () => {
      post({ kind: "push", topic: "session.expired", data: {} })
      void client.invalidate(sessionKeys.all)
    },
  })
  return new WorkerKernel({
    views: options.views ?? appViews,
    actions: options.actions ?? appActions,
    post,
    context: {
      api,
      client,
      now: options.now ?? Date.now,
      upload: options.upload ?? xhrUpload,
      notify: (progress) =>
        post({ kind: "push", topic: "upload.progress", data: progress }),
      locale: options.locale ?? "en",
    },
  })
}
