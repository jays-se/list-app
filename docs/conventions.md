# Coding conventions

## General
- TypeScript `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- Biome formatting, in the style of fms-ui: 2 spaces, 80 columns, double quotes, no semicolons, ES5 trailing commas, and sorted imports (packages, then `@app/*`, then relative).
- File names are kebab-case. React component files are `PascalCase.tsx`.
- A file must not exceed 500 lines. Split larger files into a folder with an `index.ts`.
- No default exports, except for route modules where react-router requires them.

## Domain and worker (`packages/domain/<feature>/`)
```
<feature>/
  <feature>.queries.ts    query keys and fetchers  (key: ["<feature>", ...])
  <feature>.actions.ts    mutations: validate → optimistic → call API → invalidate/rollback
  <feature>.vm.ts         view models: pure (dto, now, locale) → VM
  <feature>.views.ts      defineView({ queries, compute }) entries for the ViewRegistry
  <feature>.validators.ts shared validators that return { field, message }[]
  <feature>.test.ts
```
- View models are plain, structured-cloneable data: no class instances, `Date` objects, or functions. Dates are ISO strings, plus display strings the worker has already formatted.
- `ViewKey` and `ActionKey` use `<feature>.<name>` naming, for example `tasks.list` and `tasks.update`.
- Errors are `AppError { code, status?, title, detail?, fieldErrors? }`. Never throw raw `Response` objects.

## React (`apps/web`)
- Components receive view-model data and call actions. They contain no business logic.
- Put route modules in `apps/web/src/routes/`, feature UI in `apps/web/src/features/<feature>/`, and primitives in `@app/ui-kit`.
- Styling uses CSS Modules and design tokens (CSS custom properties). Light, dark and high-contrast themes are all required.
- With `noUncheckedIndexedAccess`, CSS-module classes are typed `string | undefined`. Wrap them in `cx(...)` from `@app/ui-kit` when a prop needs a `string`, such as NavLink's `className`.
- Accessibility: use semantic elements first. Every interactive control must be keyboard reachable and labelled.

## Backend (`apps/api`)
- See `.agents/rules/backend-go.md`.
- The contract is written first: edit `api/openapi.yaml` before changing code.
