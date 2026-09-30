---
name: add-api-endpoint
description: Add or change a Go API endpoint contract-first - OpenAPI → regenerated TS types/decoders → {module}mdl/svc/hdlr → auth/tenant middleware → problem+json errors → tests. Reference implementation - the workspace module.
---

# Add an API endpoint

This is contract-first (ADR-0002). Reference implementations:
- `apps/api/internal/modules/workspace/`, which covers tenancy, validation and error mapping.
- `apps/api/internal/modules/auth/`, which covers cookies, redirects and middleware.

## Steps
1. **Contract.** Edit `api/openapi.yaml` first.
   - Add the path and operation (`operationId`, `tags`, `responses`, and `default: Problem`).
   - Unsafe methods list `- $ref: "#/components/parameters/CsrfHeader"`.
   - Public routes set `security: []`; everything else inherits the session cookie.
   - Put schemas under `components.schemas`, in the supported subset: objects, arrays, primitives, `enum`, `$ref`, `X | null` through `type: [x, "null"]` or `anyOf`. The generator rejects anything else.
   - Dev-only routes get `x-dev-only: true`.
2. **Generate.** Run `pnpm gen:api`. This updates `packages/api-client/src/generated.ts` (types plus `decode<Name>`).
3. **Models** in `internal/modules/<m>/<m>mdl/`. Follow the naming rules in `.agents/rules/backend-go.md` §9 and §11:
   - `<m>.go`: entity
   - `<m>_req.go`: request
   - `<m>_rsp.go`: response
   - `<m>_dto.go`: `To…Rsp` functions

   JSON tags must match the OpenAPI property names exactly, and every model gets `ToJSON()`.
4. **Service** in `<m>svc/`:
   - Workspace-scoped SQL runs only inside `db.WithTenant`. Use `db.WithUser` for cross-workspace reads by one user, and `db.SetTenant` when the workspace id is created mid-transaction.
   - Validation lives here and returns a `*ValidationError{Fields}`. It must mirror the web validators in `packages/domain/**/<feature>.validators.ts`.
   - Domain errors are sentinel values (`ErrNotMember`, …). Wrap other errors with `fmt.Errorf("<m>svc: op: %w", err)`.
   - Log successful writes with `workspace_id` and `user_id`.
5. **Handler** in `<m>hdlr/`:
   - `RegisterRoutes(r *apiserver.Router)` uses `r.Handle("METHOD /path", mw(h.fn))`.
     - `auth.RequireUser` is for signed-in routes.
     - `workspaces.RequireWorkspace` is for routes scoped to the active workspace. It puts a `reqctx.Tenant` (including `Role`) into the context.
   - Decode request bodies with `apiserver.DecodeJSON`.
   - Map errors in one `handleErr`, which writes a problem response:

     | Error | Response |
     |---|---|
     | validation | `RespondValidation` (422) |
     | not found | `RespondNotFound` |
     | permission | `RespondForbidden` |
     | state | `RespondConflict` |
     | anything else | log it, then `RespondInternalError` |

     Never leak internal error text.
   - Wire the handler in `internal/app/app.go`.
6. **Tests:**
   - `internal/app/contract_test.go` fails until the routes and the spec agree. Run it.
   - Extend `internal/app/flow_test.go`, a real HTTP test against Postgres through `testdb.Pool`. Cover the happy path, CSRF (403 without the header), validation (422 plus `errors[]`), permission (403), not found (404) and the signed-out case (401).
   - Run it with `TEST_DATABASE_URL=… go test -race ./...`.
7. **Client:** add a query or action in `packages/domain` using the generated decoder. Use the `add-worker-view` or `add-worker-action` skill.
