import type { SystemInfoVM } from "@app/protocol"
import { formatDateTime, formatDuration } from "../shared/format.ts"
import type { SystemInfoDto } from "./system.queries.ts"

export function toSystemInfoVM(
  dto: SystemInfoDto,
  now: number,
  locale: string
): SystemInfoVM {
  return {
    service: dto.service,
    version: dto.version,
    uptimeText: formatDuration(now - Date.parse(dto.startedAt)),
    startedAtText: formatDateTime(dto.startedAt, locale),
  }
}
