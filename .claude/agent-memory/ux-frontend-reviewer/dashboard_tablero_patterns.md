---
name: Dashboard Tablero Patterns
description: UX patterns, anti-patterns, and conventions for module tablero/dashboard pages (Payroll, Documents, Inventory). Reviewed 2026-03-29.
type: project
---

## Confirmed good patterns (reference these)
- Inventory dashboard (`app/(app)/inventory/page.tsx`) is the canonical reference: has loading state inside table, has empty state with CTA link, uses `useMemo` for KPI derivation, correct `min-h-full` root.
- `DashboardKpiCard` and `DashboardQuickActions` are the correct shared primitives — do not inline these patterns per-page.
- `useCompany()` for companyId — never prop-drill.
- Feature hooks (`useEmployee`, `usePayrollHistory`, `useInventory`, `useDocuments`) for all data — no raw fetch in components.

## Recurring anti-patterns found (2026-03-29)

### KPI card loading state is a raw "…" character
`DashboardKpiCard` shows a literal ellipsis when `loading=true` instead of a skeleton pulse. The "…" has no minimum width, so the card collapses and causes layout shift (CLS). Fix: replace with a `<span className="inline-block h-7 w-16 animate-pulse rounded bg-surface-2" aria-hidden="true" />` skeleton, and add `aria-busy` + `aria-label` on the card wrapper.

### Raw Tailwind color tokens (not semantic)
`text-green-500`, `text-red-500`, `text-amber-500` are raw palette values. When the app switches between light/dark themes these won't adapt. The correct tokens are `text-text-success`, `text-text-danger`, `text-text-warning`. Confirmed from color_system_refactor.md.

### Missing ARIA roles on data tables
Inline `<table>` elements in payroll and inventory dashboards lack `role="table"` (redundant but required in some AT) and crucially lack `<caption>` or `aria-label`. Without these, screen readers cannot announce the table's purpose.

### Missing empty state on payroll tablero for runs
When `runsLoading=false` AND `runs.length === 0`, the "Nóminas recientes" section is simply absent with no message. Users who just set up payroll see a blank gap and don't know if the data failed to load or if there are genuinely no runs.

### Missing empty state on payroll tablero for employees
When `employees` is empty (fresh account), all three KPIs show "0" after loading — no contextual guidance to go create employees. Documents tablero has an empty state for documents — payroll tablero needs the equivalent.

### `useEffect(() => { void reload(); }, [reload])` pattern
Payroll tablero calls `reload()` inside a useEffect on mount. This is only necessary if the hook doesn't auto-fetch. If `usePayrollHistory` already fetches on mount, this is a double-fetch. Verify hook contract before shipping.

### `currentPeriod()` helper duplicated across three files
`payroll/tablero/page.tsx`, `documents/tablero/page.tsx`, and `inventory/page.tsx` all define the same `currentPeriod()` function inline. This belongs in `src/shared/frontend/utils/` or as a date utility export.

### Documents tablero: "Período" KPI card has no semantic meaning
The third KPI card shows the current `YYYY-MM` period as its value with no context for why it's useful. This is dashboard noise. Either remove it or replace with a meaningful metric ("Subidos este mes").

### Quick actions touch target on mobile
`DashboardQuickActions` link cards have `py-4` (16px top+bottom). On small screens without `desc`, the total height may fall below 44px if line height is compact. Add `min-h-[44px]` to guarantee iOS/Android minimum touch target compliance.

### Focus ring contrast
The focus ring `focus-visible:ring-primary-500/30` uses 30% opacity — this almost certainly fails WCAG 3:1 minimum for focus indicators (WCAG 2.4.11). Use `focus-visible:ring-primary-500` at full opacity, or `ring-2 ring-offset-1`.

### PageHeader CTA is a `<Link>` styled as a button
`payroll/tablero/page.tsx` line 52–57 and `documents/tablero/page.tsx` line 43–47: the primary CTA in the header is a `<Link>` with hand-rolled button classes instead of using HeroUI `Button` with `as={Link}`. This means it has no built-in disabled state, no HeroUI ripple, and the className is a verbatim copy of the class string from accounting and inventory pages. A shared `PrimaryHeaderButton` pattern or HeroUI `Button as={Link}` would be more maintainable.

### Inventory dashboard: `grid-cols-3` without responsive breakpoint
`inventory/page.tsx` line 75: `grid grid-cols-3 gap-4` — no `sm:` or `xs:` prefix. On a 320px viewport each KPI card is only ~93px wide. The payroll and documents tableros use `grid-cols-2 sm:grid-cols-3` which is correct. Inventory is now a regression.

### `APP_SIZES` not used in dashboard components
`DashboardKpiCard`, `DashboardQuickActions`, and all three tablero pages hard-code font sizes (`text-[13px]`, `text-[12px]`) instead of importing from `APP_SIZES`. When the scale changes, these components won't update. Use `APP_SIZES.text.tableHeader` for section label text, etc.

**Why:** Consistent with the typography_scale.md convention that all shared components should derive sizes from APP_SIZES.
**How to apply:** Any new or modified dashboard component should import APP_SIZES and use its tokens rather than raw px values.
