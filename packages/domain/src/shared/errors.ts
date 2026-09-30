import {
  type FieldError,
  type ProtocolError,
  protocolError,
} from "@app/protocol"

/** Client-side validation failure (ADR-0019): same shape as a server 422. */
export function validationError(fieldErrors: FieldError[]): ProtocolError {
  return protocolError(
    "VALIDATION",
    fieldErrors[0]?.message ?? "Check the highlighted fields.",
    { fieldErrors }
  )
}
