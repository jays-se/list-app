/** "45s", "3m 12s", "2h 5m", "4d 3h" — two most significant units. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const units: [string, number][] = [
    ["d", Math.floor(total / 86_400)],
    ["h", Math.floor(total / 3600) % 24],
    ["m", Math.floor(total / 60) % 60],
    ["s", total % 60],
  ]
  const first = units.findIndex(([, value]) => value > 0)
  if (first === -1) return "0s"
  return units
    .slice(first, first + 2)
    .filter(([, value]) => value > 0)
    .map(([unit, value]) => `${value}${unit}`)
    .join(" ")
}

export function formatDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso))
}

/** "512 B", "3.4 KB", "4.8 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ["KB", "MB", "GB"]
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/** "just now", "5 min ago", "3 h ago", "yesterday", else a date. */
export function relativeTime(iso: string, now: number, locale: string): string {
  const diff = Math.max(0, now - Date.parse(iso))
  const minutes = Math.floor(diff / 60_000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} h ago`
  if (hours < 48) return "yesterday"
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(
    new Date(iso)
  )
}
