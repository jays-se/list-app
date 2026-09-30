import {
  type Client,
  decodeClientResponse,
  decodeTaskList,
} from "@app/api-client"
import type {
  ClientDetailVM,
  ClientDraft,
  ClientsVM,
  ClientVM,
  FieldError,
} from "@app/protocol"
import type { QueryOptions } from "@app/query"
import { LABEL_COLORS } from "../labels/labels.ts"
import { defineAction, defineView } from "../runtime.ts"
import { sessionQuery } from "../session/session.queries.ts"
import { todayISO } from "../shared/dates.ts"
import { validationError } from "../shared/errors.ts"
import { clientKeys, clientsQuery, taskKeys } from "../tasks/tasks.queries.ts"
import { toTaskRowVM } from "../tasks/tasks.vm.ts"

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Mirrors apps/api clientsvc.Validate. */
export function validateClient(d: ClientDraft): FieldError[] {
  const errors: FieldError[] = []
  const n = [...d.name.trim()].length
  if (n === 0)
    errors.push({ field: "name", message: "Client name is required" })
  else if (n > 100)
    errors.push({
      field: "name",
      message: "Client name must be 100 characters or fewer",
    })
  if (d.email.trim() && !EMAIL.test(d.email.trim())) {
    errors.push({ field: "email", message: "Enter a valid email" })
  }
  if ([...d.phone.trim()].length > 40) {
    errors.push({
      field: "phone",
      message: "Phone must be 40 characters or fewer",
    })
  }
  if (!LABEL_COLORS.some((c) => c.value === d.color))
    errors.push({ field: "color", message: "Pick a color" })
  return errors
}

const orNull = (s: string) => (s.trim() ? s.trim() : null)
const toBody = (d: ClientDraft) => ({
  name: d.name.trim(),
  email: orNull(d.email),
  phone: orNull(d.phone),
  color: d.color,
  notes: orNull(d.notes),
})

function toClientVM(c: Client): ClientVM {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    color: c.color,
    notes: c.notes,
    taskCountText: `${c.taskCount} ${c.taskCount === 1 ? "task" : "tasks"}`,
  }
}

function clientQuery(
  api: Parameters<typeof clientsQuery>[0],
  id: string
): QueryOptions<Client> {
  return {
    key: clientKeys.detail(id),
    ttl: 0,
    retry: 0,
    fetcher: async ({ signal }) =>
      decodeClientResponse(
        await api.get(`/clients/${encodeURIComponent(id)}`, { signal })
      ).client,
  }
}

export const clientViews = {
  "clients.list": defineView({
    queries: (_p: Record<string, never>, ctx) => ({
      clients: clientsQuery(ctx.api),
      session: sessionQuery(ctx.api),
    }),
    compute: ({ clients, session }): ClientsVM => ({
      clients: clients.clients.map(toClientVM),
      canDelete: session.workspaces?.active?.role === "OWNER",
      colorOptions: LABEL_COLORS,
      emptyText: "No clients yet. Add one to link tasks and docs to it.",
    }),
  }),
  "clients.detail": defineView({
    queries: (p: { clientId: string }, ctx) => ({
      client: clientQuery(ctx.api, p.clientId),
      session: sessionQuery(ctx.api),
      tasks: {
        key: [...taskKeys.lists, "client", p.clientId],
        ttl: 0,
        fetcher: async ({ signal }: { signal: AbortSignal }) =>
          decodeTaskList(
            await ctx.api.get(
              `/tasks?clientId=${encodeURIComponent(p.clientId)}`,
              { signal }
            )
          ).tasks,
      },
    }),
    compute: ({ client, session, tasks }, _p, ctx): ClientDetailVM => {
      const today = todayISO(ctx.now())
      return {
        client: toClientVM(client),
        saved: {
          name: client.name,
          email: client.email ?? "",
          phone: client.phone ?? "",
          color: client.color,
          notes: client.notes ?? "",
        },
        tasks: tasks.map((t) => toTaskRowVM(t, today, ctx.locale)),
        tasksText: `${tasks.length} linked ${tasks.length === 1 ? "task" : "tasks"}`,
        canDelete: session.workspaces?.active?.role === "OWNER",
        colorOptions: LABEL_COLORS,
      }
    },
  }),
}

export const clientActions = {
  "clients.create": defineAction(async (draft: ClientDraft, ctx) => {
    const errors = validateClient(draft)
    if (errors.length) throw validationError(errors)
    const { client } = decodeClientResponse(
      await ctx.api.post("/clients", toBody(draft))
    )
    await ctx.client.invalidate(clientKeys.all)
    return { id: client.id }
  }),
  "clients.update": defineAction(
    async (input: { clientId: string; draft: ClientDraft }, ctx) => {
      const errors = validateClient(input.draft)
      if (errors.length) throw validationError(errors)
      await ctx.api.put(
        `/clients/${encodeURIComponent(input.clientId)}`,
        toBody(input.draft)
      )
      await Promise.all([
        ctx.client.invalidate(clientKeys.all),
        ctx.client.invalidate(taskKeys.all),
      ])
      return null
    }
  ),
  "clients.delete": defineAction(async (input: { clientId: string }, ctx) => {
    await ctx.api.delete(`/clients/${encodeURIComponent(input.clientId)}`)
    ctx.client.removeQueries(clientKeys.detail(input.clientId))
    await Promise.all([
      ctx.client.invalidate(clientKeys.all),
      ctx.client.invalidate(taskKeys.all),
    ])
    return null
  }),
}
