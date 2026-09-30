import {
  type FieldError,
  type ProtocolError,
  protocolError,
} from "@app/protocol"

/** RFC 7807 problem+json as returned by the API. */
export interface ProblemDetails {
  type?: string
  title?: string
  status?: number
  detail?: string
  errors?: FieldError[]
}

const FALLBACK_MESSAGE = "Something went wrong"

/** An HTTP error from the API, normalized from problem+json. */
export class AppError extends Error {
  readonly status: number
  readonly type: string
  readonly title: string
  readonly detail: string
  readonly fieldErrors: FieldError[]

  constructor(status: number, problem: ProblemDetails) {
    const title = problem.title ?? ""
    const detail = problem.detail ?? ""
    super(detail || title || FALLBACK_MESSAGE)
    this.name = "AppError"
    this.status = status
    this.type = problem.type ?? "about:blank"
    this.title = title
    this.detail = detail
    this.fieldErrors = Array.isArray(problem.errors) ? problem.errors : []
  }

  toProtocolError(): ProtocolError {
    return protocolError(`HTTP_${this.status}`, this.message, {
      status: this.status,
      ...(this.fieldErrors.length ? { fieldErrors: this.fieldErrors } : {}),
    })
  }
}
