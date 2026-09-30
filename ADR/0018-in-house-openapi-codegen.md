# ADR-0018: In-house OpenAPI → TypeScript types and runtime decoders

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E1-S3, E2-S2

## Context
ADR-0002 calls for types generated from `api/openapi.yaml`. E1-S3 also wants runtime decoders that report the path of any mismatch. The usual tools, `openapi-typescript` and `oapi-codegen`, bring large dependency trees and emit much more than we use. Our schemas use a small subset: objects, arrays, primitives, `enum`, `format`, nullable types, `$ref` and `additionalProperties`.

## Decision
- **TypeScript:** `scripts/gen-api.mjs` reads the spec, using the `yaml` package as a **dev-only** parser, and writes `packages/api-client/src/generated.ts` containing:
  - one `interface`/`type` per `components.schemas` entry
  - one `decode<Name>(value, path)` function per schema that checks `type`, `required`, `enum` and nesting, and throws `DecodeError` with a JSON path such as `$.workspaces[0].name`
- The generated file is committed. `pnpm check:api` fails if it is stale, and it runs in CI and in the pre-commit hook.
- The worker decodes every response through these decoders before caching it.
- **Go:** request and response structs stay hand-written (in `*mdl` packages, per the Go rule). Drift is caught by the route↔spec test (`TestContractMatchesOpenAPI`) and by handler tests that decode real responses. Go stub generation is **not** adopted.

## Alternatives considered
- **openapi-typescript plus a validator library (zod, ajv).** These are extra runtime dependencies inside the worker bundle.
- **oapi-codegen for Go.** Generated handlers clash with the `{module}hdlr` layout.

## Consequences
- The generator supports only the schema subset listed above. It fails loudly on anything else, so the spec stays simple.
- Decoders add a small cost to each fetch, which runs in the worker and off the main thread.
