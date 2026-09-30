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
