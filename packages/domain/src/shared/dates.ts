/**
 * Calendar-date helpers for "YYYY-MM-DD" strings (API `format: date`).
 * All maths is on UTC midnights so time zones and DST can't shift a day.
 */
const DAY_MS = 86_400_000

const formatters = new Map<string, Intl.DateTimeFormat>()
function formatter(locale: string, options: Intl.DateTimeFormatOptions) {
  const key = `${locale}|${JSON.stringify(options)}`
  let f = formatters.get(key)
  if (!f) {
    f = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })
    formatters.set(key, f)
  }
  return f
}

function toUTC(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number]
  return Date.UTC(y, m - 1, d)
}

/** Today's date in the user's time zone (or `timeZone`), as YYYY-MM-DD. */
export function todayISO(now: number, timeZone?: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(now))
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS)
}

/** "9 Oct" this year, "9 Oct 2027" otherwise (order follows the locale). */
export function formatDay(iso: string, today: string, locale: string): string {
  const sameYear = iso.slice(0, 4) === today.slice(0, 4)
  return formatter(locale, {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  }).format(toUTC(iso))
}

export function formatRange(
  start: string,
  end: string,
  today: string,
  locale: string
): string {
  if (start === end) return formatDay(start, today, locale)
  return `${formatDay(start, today, locale)} – ${formatDay(end, today, locale)}`
}

export function formatLongDate(isoDateTime: string, locale: string): string {
  return formatter(locale, { dateStyle: "medium" }).format(
    new Date(isoDateTime)
  )
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(iso: string, days: number): string {
  return new Date(toUTC(iso) + days * DAY_MS).toISOString().slice(0, 10)
}

/** 0 = Sunday … 6 = Saturday. */
export function weekday(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay()
}

/** Formats a YYYY-MM-DD date with any Intl options (UTC, cached). */
export function formatDate(
  iso: string,
  locale: string,
  options: Intl.DateTimeFormatOptions
): string {
  return formatter(locale, options).format(toUTC(iso))
}
