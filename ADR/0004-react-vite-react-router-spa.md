# ADR-0004: React 19 + Vite + react-router SPA

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S1, E3-S2

## Context
The app sits behind authentication, so SEO does not matter. The main constraint is that React only renders. The team already knows React (fms-ui, demo-ui). The full options comparison is in `docs/mvp-plan.md` §5.

## Decision
- A client-rendered SPA built with React 19 and Vite.
- Routing uses `react-router` in data-router mode. Filter state lives in URL search params.
- Route loaders may only call `bridge.prefetch(viewKey, params)`, which starts loading in the worker without waiting.

## Alternatives considered
- Next.js or react-router framework mode (SSR/RSC): moves data logic to the server, which conflicts with a data layer owned by the worker.
- Solid, Svelte, Vue, Angular, Lit, HTMX: the team would have to retrain or switch stacks, and none offers a decisive gain for this product.

## Consequences
- One more runtime dependency: `react-router`.
- Deep links work, and nginx needs an SPA fallback.
