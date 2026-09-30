---
name: add-worker-view
description: Add a read-only screen's data as a worker view model (query → view model → ViewKey → useView) so React only renders. Use whenever a UI needs server data. Reference implementation - the `system.info` view.
---

# Add a worker view

React never fetches or transforms data (ADR-0005). A view is: queries (in the worker) → `compute` (pure, in the worker) → a display-ready view model → `useView` (React).

Reference implementation: `system.info`.
- `packages/protocol/src/views/system.ts`
- `packages/domain/src/system/*`
- `apps/web/src/features/system/HomePage.tsx`

## Steps
1. **Contract.** The endpoint must exist in `api/openapi.yaml`. If it doesn't, add it and its Go handler first. The `add-api-endpoint` skill arrives with E3-S3; until then, copy `apps/api/internal/modules/system/`.
2. **View model type.** Put it in `packages/protocol/src/views/<feature>.ts` and export it from `packages/protocol/src/index.ts`.
   - It must be plain and structured-cloneable: no `Date`, class instances or functions.
   - Include display-ready strings, such as formatted dates and counts, so React does no maths.
3. **Register the key** in `ViewMap` (`packages/protocol/src/registry.ts`):
   `"<feature>.<name>": { params: {...}; data: <Name>VM }`.
4. **Query** in `packages/domain/src/<feature>/<feature>.queries.ts`:
   - The DTO interface mirrors the OpenAPI schema.
   - Key factory: `["<feature>", ...]`.
   - `QueryOptions` needs a `fetcher` that passes `{ signal }` through to `ctx.api.get` and **decodes the response with the generated `decode<Schema>`** from `@app/api-client`. Run `pnpm gen:api` after changing the spec.
   - Set `ttl`. Set `refetchInterval` only if the reference app polls this screen (15 s lists, 10 s details, 20 s inbox).
5. **View model** in `<feature>.vm.ts`: a pure `to<Name>VM(dto, now, locale)`. Pass time and locale in as arguments; don't read them inside.
6. **View definition** in `<feature>.views.ts`:
   ```ts
   export const <feature>Views = {
     "<feature>.<name>": defineView({
       queries: (params: P, ctx) => ({ main: someQuery(ctx.api, params) }),
       compute: ({ main }, params, ctx) => toVM(main, ctx.now(), ctx.locale),
     }),
   }
   ```
   Spread it into `views` in `packages/domain/src/index.ts`. The `satisfies ViewRegistry` check fails to compile if you forget.
7. **UI**:
   - Read it with `const vm = useView("<feature>.<name>", params)`.
   - Render the `loading` state with `Spinner`, and `error` with `vm.error.message`. `vm.data` can exist together with `vm.error` when a background refetch fails.
   - Filter and sort intent comes from URL search params and is passed as `params`.
   - Optionally, the route `loader` calls `bridge.prefetch(key, params)` and returns `null`.
8. **Tests:**
   - Domain: a unit test of the pure view-model function (`<feature>.test.ts`), with no mocks.
   - Kernel/bridge: if you need a new behaviour, follow `packages/worker/src/kernel.test.ts` (fake `fetch` via `createKernel`).
   - Component: render against the inline backend, as in `packages/bridge/src/bridge.test.tsx`.
   - E2E: assert the data appears while main-thread network is forbidden (`e2e/smoke.spec.ts`).
9. Run `pnpm check`.

## Don't
- Don't import `@app/domain`, `@app/query` or `@app/api-client` in `apps/web`. The boundary check fails CI.
- Don't compute in `useMemo` in React. Add a field to the view model instead.
- Don't put functions or `Date` in view models, because structured clone drops or breaks them.
