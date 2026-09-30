---
description: Split modules over 500 lines. (Reused from demo-ui/.cursor/rules/frontend.mdc)
---

## File size

No component or module file may exceed **500 lines**. Split into a folder of modules when it would exceed that.

Generated files (for example `packages/api-client/src/generated.ts`, ADR-0018) are exempt; change the generator, not the output.
