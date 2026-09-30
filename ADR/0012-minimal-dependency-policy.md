# ADR-0012: Minimal-dependency policy

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S1

## Context
The requester prefers in-house code to external libraries.

## Decision
- Runtime dependencies are limited to `react`, `react-dom` and `react-router`.
- Dev tooling may use vite, typescript, biome, vitest, testing-library and playwright.
- Any new runtime dependency needs an ADR covering its size, maintenance status and the alternative of building it in-house.

## Alternatives considered
- Allowing any dependency without review.

## Consequences
- We build our own date helpers (on `Intl`), validators and decoders, markdown renderer and query engine.
- We gain a smaller bundle and fewer supply-chain risks.
