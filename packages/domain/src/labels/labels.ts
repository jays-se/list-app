import { decodeLabelResponse } from "@app/api-client"
import type {
  FieldError,
  LabelColorKey,
  LabelsVM,
  OptionVM,
} from "@app/protocol"
import { defineAction, defineView } from "../runtime.ts"
import { sessionQuery } from "../session/session.queries.ts"
import { validationError } from "../shared/errors.ts"
import { labelKeys, labelsQuery, taskKeys } from "../tasks/tasks.queries.ts"

export const LABEL_COLORS: OptionVM<LabelColorKey>[] = [
  { value: "gray", label: "Gray" },
  { value: "red", label: "Red" },
  { value: "orange", label: "Orange" },
  { value: "yellow", label: "Yellow" },
  { value: "green", label: "Green" },
  { value: "teal", label: "Teal" },
  { value: "blue", label: "Blue" },
  { value: "purple", label: "Purple" },
  { value: "pink", label: "Pink" },
]

/** Mirrors apps/api labelsvc.Validate. */
export function validateLabel(name: string, color: string): FieldError[] {
  const errors: FieldError[] = []
  const n = [...name.trim()].length
  if (n === 0) errors.push({ field: "name", message: "Label name is required" })
  else if (n > 40)
    errors.push({
      field: "name",
      message: "Label name must be 40 characters or fewer",
    })
  if (!LABEL_COLORS.some((c) => c.value === color)) {
    errors.push({ field: "color", message: "Pick a label color" })
  }
  return errors
}

export const labelViews = {
  "labels.list": defineView({
    queries: (_params: Record<string, never>, ctx) => ({
      labels: labelsQuery(ctx.api),
      session: sessionQuery(ctx.api),
    }),
    compute: ({ labels, session }): LabelsVM => {
      const canDelete = session.workspaces?.active?.role === "OWNER"
      return {
        labels: labels.labels.map((l) => ({ ...l, canDelete })),
        colorOptions: LABEL_COLORS,
        canDelete,
      }
    },
  }),
}

export const labelActions = {
  "labels.create": defineAction(
    async (input: { name: string; color: LabelColorKey }, ctx) => {
      const errors = validateLabel(input.name, input.color)
      if (errors.length) throw validationError(errors)
      const { label } = decodeLabelResponse(
        await ctx.api.post("/labels", {
          name: input.name.trim(),
          color: input.color,
        })
      )
      await ctx.client.invalidate(labelKeys.all)
      return label
    }
  ),
  "labels.delete": defineAction(async (input: { labelId: string }, ctx) => {
    await ctx.api.delete(`/labels/${encodeURIComponent(input.labelId)}`)
    await Promise.all([
      ctx.client.invalidate(labelKeys.all),
      ctx.client.invalidate(taskKeys.all),
    ])
    return null
  }),
}
