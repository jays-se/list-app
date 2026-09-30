# ADR-0014: In-house design system modelled on Fluent 2

- **Status:** Accepted
- **Date:** 2026-09-30
- **Tickets:** E0-S5, E12-S3

## Context
The requester wants our own design system and suggested Microsoft Fluent 2 as the reference. We must not copy the UI of list.intellicar.app. ADR-0012 limits runtime dependencies, so `@fluentui/react-components` is out.

## Decision
We build `@app/ui-kit` in-house and follow Fluent 2's **design principles and token architecture**. We don't use its code, fonts or brand assets.

- **Tokens** come in two layers, mirroring Fluent's model.
  - **Global tokens** are raw ramps: a neutral grey ramp, one brand ramp with 16 steps, and status colours (danger, warning, success, info).
  - **Alias (semantic) tokens** are named by role, for example `colorNeutralForeground1`, `colorNeutralBackground2`, `colorBrandBackground` and `colorStrokeFocus2`.
  - Components use alias tokens only.
- **Themes:** light, dark and high-contrast (`forced-colors` aware), switched by `data-theme` on `<html>` so React doesn't re-render.
- **Foundations:**
  - Spacing on a 4px grid.
  - A type ramp from Caption to Display, with sizes and line heights on a 4px rhythm.
  - Corner radii: none, small, medium, large and circular.
  - Elevation as shadow levels 2/4/8/16/28/64.
  - Motion durations and easing curves, with `prefers-reduced-motion` respected.
  - A 2px focus ring with an inner and outer stroke.
- **Typography:** a system font stack, with Segoe UI on Windows, `-apple-system` and system-ui elsewhere. No bundled fonts.
- **Icons:** an in-house SVG icon set on a 20/24px grid, with regular and filled variants. We don't bundle Fluent's icon package.
- **Components** keep a Fluent-like API shape (`appearance`, `size`, `shape`), and their accessibility behaviour follows WAI-ARIA APG patterns.
- **Delivery:** tokens are authored in TS and generated to CSS custom properties. Components are styled with CSS Modules. A `/_design` gallery route runs in dev.

## Alternatives considered
- **Use `@fluentui/react-components`.** Rejected: it adds a large dependency (Griffel CSS-in-JS runtime), which goes against ADR-0012.
- **Adopt demo-ui's nemo-ui theme.** Rejected: that is a different product's visual identity, and it is based on inline styles.
- **Copy the reference app's look.** Explicitly out of scope.

## Consequences
- The UI feels familiar to Fluent users and builds on a well-documented, accessible design basis.
- We own the upkeep of the components, so E0-S5 carries a component budget and further primitives are added only when a story needs them.
- Brand colour choice is still open. For now it is a placeholder ramp that can be swapped via tokens.
