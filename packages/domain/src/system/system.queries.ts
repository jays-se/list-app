import {
  type ApiClient,
  decodeSystemInfo,
  type SystemInfo,
} from "@app/api-client"
import type { QueryOptions } from "@app/query"

export type SystemInfoDto = SystemInfo

export const systemKeys = {
  all: ["system"] as const,
  info: ["system", "info"] as const,
}

export function systemInfoQuery(api: ApiClient): QueryOptions<SystemInfoDto> {
  return {
    key: systemKeys.info,
    fetcher: async ({ signal }) =>
      decodeSystemInfo(await api.get("/system/info", { signal })),
    ttl: 30_000,
    refetchInterval: 30_000,
  }
}
