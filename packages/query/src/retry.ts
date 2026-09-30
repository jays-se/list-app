export function isAbortError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    (error as { name?: unknown }).name === "AbortError"
  )
}

export function defaultIsRetryable(error: unknown): boolean {
  if (isAbortError(error)) return false
  const status = (error as { status?: unknown } | null)?.status
  return !(typeof status === "number" && status >= 400 && status < 500)
}

export function defaultRetryDelay(attempt: number): number {
  return Math.min(1000 * 2 ** attempt, 30_000)
}

export function abortError(): Error {
  const error = new Error("The operation was aborted")
  error.name = "AbortError"
  return error
}

/** Resolves after `ms`, or rejects with an AbortError when `signal` aborts. */
export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(abortError())
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve()
    }, ms)
    function onAbort() {
      clearTimeout(timer)
      reject(abortError())
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}
