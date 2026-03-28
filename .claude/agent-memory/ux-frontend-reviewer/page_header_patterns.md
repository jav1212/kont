---
name: PageHeader component patterns
description: PageHeader shared component: design decisions, known inconsistencies vs. other inventory pages, type-scale deviation from APP_SIZES
type: project
---

`PageHeader` was introduced in the 2026-03-28 refactor to replace inline header markup in products/suppliers/departments pages.

## What it does well
- Canonical token use: `bg-surface-1`, `border-border-light`
- Children slot for action buttons (no business logic inside)
- Optional subtitle displayed in a dimmed line

## Known issues to watch

**Title font size does not match the pre-existing header pattern.**
`purchases/page.tsx` (not yet refactored) uses `text-[16px]` for its `<h1>`. `PageHeader` uses `text-[13px]` for its `<h1>`. This is a visible inconsistency across inventory pages.

**Neither size is from APP_SIZES.**
APP_SIZES has no `pageTitle` token. Both the old inline headers and the new PageHeader use raw `text-[npx]` values — the scale is not canonicalized. A `text.pageTitle` token should be added to APP_SIZES.

**Subtitle is `text-[10px]`** — below the project's minimum legible text size (see APP_SIZES rationale: 12 px minimum for labels, 11 px for badges). At 10 px with `uppercase tracking-[0.14em]` the subtitle risks WCAG AA failure.

## Button size inconsistency introduced
- `products/page.tsx` uses `size="md"` in the header, `size="sm"` in all form CTAs — intentional hierarchy.
- `suppliers/page.tsx` and `departments/page.tsx` use `size="sm"` everywhere, including the header buttons.
- The two pages that use `size="sm"` in the header produce noticeably smaller header action buttons than the `size="md"` pattern used in products. This is a cross-page inconsistency.

## dangerOutline variant
Used consistently as the pre-confirmation trigger for bulk delete across all three pages — correct semantic use: signals danger intent without committing the action until a second explicit confirmation step.

**Why:** Record for future reviews — dangerOutline = pre-confirmation affordance, danger = confirmed destructive action.
**How to apply:** If a new page adds bulk-delete, follow this two-step pattern: dangerOutline -> inline confirmation -> danger button with loading state.
