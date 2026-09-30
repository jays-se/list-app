---
description: Worker data-plane rules for packages/{query,domain,worker,api-client,protocol,bridge}.
paths:
  - "packages/query/**/*.ts"
  - "packages/domain/**/*.ts"
  - "packages/worker/**/*.ts"
  - "packages/api-client/**/*.ts"
  - "packages/protocol/**/*.ts"
  - "packages/bridge/**/*.ts"
---
- Everything except `bridge` runs in a Dedicated Worker. Do not use `window`, `document` or React there.
- Messages are `command | rpc | push`, typed in `@app/protocol` (ADR-0007). Only structured-cloneable data may cross.
- Feature layout: `<feature>.queries.ts / .actions.ts / .vm.ts / .validators.ts` (`docs/conventions.md`).
- View models are pure and deterministic. Push a view model only when it changed.
- Query keys follow the form `["<feature>", ...]`. Use `invalidate(prefix)` after mutations and `clearAll()` on workspace switch.
- Reference patterns: `../fms-ui/packages/query` and the fms-ui branch `changes/karan-rohit` (`packages/realtime`).
