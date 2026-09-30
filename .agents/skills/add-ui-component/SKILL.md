---
name: add-ui-component
description: Add a presentational primitive to @app/ui-kit (Fluent 2-inspired, token-only, accessible) with tests and a /_design gallery entry. Use when a story needs a UI building block that ui-kit doesn't have yet.
---

# Add a ui-kit component

The rules come from ADR-0014 and ADR-0012:
- Build it in-house. Don't use `@fluentui/*`.
- Use alias tokens only.
- Must work in light, dark and high-contrast.
- WCAG 2.2 AA.
- No data imports.

Reference implementations:
- `Button`: appearances, sizes, shapes
- `Field` + `Input`: context-based ARIA wiring
- `Checkbox`: native input with a styled indicator

## Steps
1. **API shape**: follow Fluent-like props (`appearance`, `size`, `shape`) and extend the native element's attributes (`ButtonHTMLAttributes`, etc.). Default `type="button"` for buttons.
2. **Files**: create `packages/ui-kit/src/components/<Name>/<Name>.tsx` and `<Name>.module.css`, and export both the component and its props type from `src/index.ts`.
3. **Styling**:
   - Use only `var(--token)` values from `src/styles/tokens.css`. No hex colours, raw px spacing or custom shadows. Structural sizes such as control heights on the 4px grid are fine.
   - If a role is missing, **add an alias token** in `src/tokens/alias.ts` for all three themes, run `pnpm tokens`, and add a contrast pair to `src/tokens/contrast.test.ts`.
   - Handle `:hover`, `:active`, `:focus-visible` (the global focus ring comes from base.css), `:disabled`, and `@media (forced-colors: active)`.
   - Put transitions on `--duration*` tokens so reduced motion zeroes them.
4. **Accessibility**:
   - Prefer native elements.
   - Wire `id`, `aria-describedby`, `aria-invalid` and `required` from `useFieldControl()` if it's a form control.
   - Icon-only controls must require `aria-label`, and decorative icons get `aria-hidden`.
   - Follow the WAI-ARIA APG pattern for composite widgets (menu, tabs, dialog).
5. **Tests** go in `src/components/components.test.tsx` or a sibling test file. Query by role and name, test keyboard behaviour, disabled state and ARIA wiring. Never assert on class names.
6. **Gallery**: add a specimen to `apps/web/src/features/design/ComponentGallery.tsx` that shows every appearance and state.
7. **Verify**:
   - Run `pnpm check`.
   - Run `pnpm test:e2e`. The axe checks on `/_design` cover light and dark.
   - Look at `/_design` in all three themes yourself.
