---
name: add-worker-action
description: Add a mutation as a worker action (validate in worker → API call → decode → reset/invalidate → typed result) and call it from React with useAction. Reference implementation - workspaces.create / workspaces.join / auth.logout.
---

# Add a worker action

React never calls the API. It calls `useAction(key).run(input)`, and the worker does the rest (ADR-0005, ADR-0019).

Reference implementations:
- `packages/domain/src/session/session.actions.ts`
- `apps/web/src/features/workspace/WorkspaceForms.tsx`

## Steps
1. **Declare it** in `packages/protocol/src/registry.ts` under `ActionMap`:
   `"<feature>.<verb>": { input: {...}; result: <SmallVM> }`
   - Input and result must be structured-cloneable.
   - Return only what the UI needs, usually an id and a name. Views refetch everything else.
2. **Validators** go in `packages/domain/src/<feature>/<feature>.validators.ts`. They are pure `(input) → FieldError[]` functions and **must match the Go service's validation messages**.
3. **Action** in `<feature>.actions.ts`:
   ```ts
   "<feature>.<verb>": defineAction(async (input: In, ctx) => {
     const errors = validateX(input)
     if (errors.length) throw validationError(errors)      // code VALIDATION, nothing sent
     const result = decodeY(await ctx.api.post("/path", body))
     await ctx.client.invalidate(featureKeys.all)          // data changed in this tenant
     // or ctx.resetData()                                  // the tenant/session itself changed
     return toResultVM(result)
   })
   ```
   Then spread it into `actions` in `packages/domain/src/index.ts`. `satisfies ActionRegistry` enforces the types.
   - Use `ctx.resetData()` only for tenant or session changes (switch, create or join a workspace, logout). Never call `client.clearAll()`.
   - For optimistic UI, use `ctx.client.optimistic(key, updater)` before the call, and roll back in `catch`.
4. **UI:**
   - `const create = useAction("<feature>.<verb>")`.
   - Keep the draft input in `useState`; that's ephemeral UI state.
   - Show `create.pending`.
   - Put `create.error.fieldErrors` on the matching `Field validationMessage`. Show a form-level `role="alert"` only when no field claimed the error.
   - Call `create.reset()` when the user edits.
   - Let navigation follow data where possible. Route guards react to view changes, so don't `navigate()` as well, or it will race the guard.
5. **Tests:**
   - Validators: pure unit tests.
   - Action through the real kernel with a fake API: see `packages/worker/src/session-flow.test.ts`. Assert that the VALIDATION case sends nothing.
   - UI: see `apps/web/src/app/app-routes.test.tsx`, which uses the inline backend and a memory router.
   - E2E: the happy path plus one server error.
