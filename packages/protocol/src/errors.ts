/**
 * Error codes that cross the worker boundary (ADR-0007).
 * - BAD_REQUEST: malformed message, or an unknown view/action.
 * - FAILED: the action threw a non-HTTP error.
 * - TIMEOUT: no RPC reply within the deadline.
 * - WORKER_FAILED: the worker crashed or the bridge was stopped.
 * - VALIDATION: the worker rejected action input before calling the API (ADR-0019).
 * - HTTP_<status>: the API answered with an error status.
 */
export type ErrorCode =
  | "BAD_REQUEST"
  | "VALIDATION"
  | "FAILED"
  | "TIMEOUT"
  | "WORKER_FAILED"
  | `HTTP_${number}`

export interface FieldError {
  field: string
  message: string
}

export interface ProtocolError {
  code: ErrorCode
  /** Human-readable text, safe to show in the UI. */
  message: string
  status?: number
  fieldErrors?: FieldError[]
}

export function protocolError(
  code: ErrorCode,
  message: string,
  extra: Omit<ProtocolError, "code" | "message"> = {}
): ProtocolError {
  return { code, message, ...extra }
}

export function isProtocolError(value: unknown): value is ProtocolError {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ProtocolError).code === "string" &&
    typeof (value as ProtocolError).message === "string"
  )
}
