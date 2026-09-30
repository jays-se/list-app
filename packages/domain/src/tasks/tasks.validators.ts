import type { FieldError, TaskDraft } from "@app/protocol"

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Mirrors apps/api tasksvc/validate.go (same fields and messages). */
export function validateTaskDraft(d: TaskDraft): FieldError[] {
  const errors: FieldError[] = []
  const title = d.title.trim()
  if (!title) errors.push({ field: "title", message: "Title is required" })
  else if ([...title].length > 500) {
    errors.push({
      field: "title",
      message: "Title must be 500 characters or fewer",
    })
  }
  if (!d.startDate || !d.endDate) {
    if (!d.startDate)
      errors.push({
        field: "startDate",
        message: "Start and end date are required",
      })
    if (!d.endDate)
      errors.push({
        field: "endDate",
        message: "Start and end date are required",
      })
  } else if (!DATE.test(d.startDate)) {
    errors.push({ field: "startDate", message: "Enter a valid date" })
  } else if (!DATE.test(d.endDate)) {
    errors.push({ field: "endDate", message: "Enter a valid date" })
  } else if (d.endDate < d.startDate) {
    errors.push({
      field: "endDate",
      message: "End date must be on or after start date",
    })
  }
  if (d.dueDate && !DATE.test(d.dueDate)) {
    errors.push({ field: "dueDate", message: "Enter a valid date" })
  }
  return errors
}
