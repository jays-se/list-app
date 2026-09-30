import type { ApiClient } from "@app/api-client"
import type { QueryOptions } from "@app/query"

/** `GET /api/v1/system/info` (api/openapi.yaml). */
export interface SystemInfoDto {
  service: string
  version: string
  startedAt: string
}

export const systemKeys = {
  all: ["system"] as const,
  info: ["system", "info"] as const,
}

export function systemInfoQuery(api: ApiClient): QueryOptions<SystemInfoDto> {
  return {
    key: systemKeys.info,
    fetcher: ({ signal }) => api.get<SystemInfoDto>("/system/info", { signal }),
    ttl: 30_000,
    refetchInterval: 30_000,
  }
}
