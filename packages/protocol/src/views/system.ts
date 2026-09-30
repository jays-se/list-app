/** `system.info` - API identity, used as the Sprint 0 end-to-end probe. */
export interface SystemInfoVM {
  service: string
  version: string
  /** Pre-formatted by the worker, e.g. "3m 12s". */
  uptimeText: string
  /** Pre-formatted by the worker in the user's locale. */
  startedAtText: string
}
